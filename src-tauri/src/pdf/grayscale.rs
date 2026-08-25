use std::collections::HashSet;
use std::fs;

use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, GrayImage, ImageEncoder};
use lopdf::{Dictionary, Document, Object, ObjectId};

use crate::error::AppError;
use crate::pdf::atomic::save_document;
use crate::pdf::layout::detect_margin_chrome;
use crate::pdf::model::GrayscaleResult;
use crate::pdf::reader::load_document;

/// Re-encode quality for converted images — matches the 70-80 range used by
/// the reference script; 75 keeps visible quality while shrinking hard.
const JPEG_QUALITY: u8 = 75;

enum ColorKind {
    Gray,
    Rgb,
    Cmyk,
    Unsupported,
}

/// Classify a resolved (dereferenced) color space object.
fn classify_resolved(doc: &Document, obj: &Object) -> ColorKind {
    match obj {
        Object::Name(name) => match name.as_slice() {
            b"DeviceGray" | b"CalGray" | b"G" => ColorKind::Gray,
            b"DeviceRGB" | b"CalRGB" | b"RGB" => ColorKind::Rgb,
            b"DeviceCMYK" | b"CMYK" => ColorKind::Cmyk,
            _ => ColorKind::Unsupported,
        },
        Object::Array(arr) if !arr.is_empty() => {
            let family = arr[0].as_name().unwrap_or(b"");
            match family {
                b"ICCBased" => arr
                    .get(1)
                    .and_then(|o| o.as_reference().ok())
                    .and_then(|id| doc.get_dictionary(id).ok())
                    .and_then(|d| d.get(b"N").and_then(Object::as_i64).ok())
                    .map(|n| match n {
                        1 => ColorKind::Gray,
                        3 => ColorKind::Rgb,
                        4 => ColorKind::Cmyk,
                        _ => ColorKind::Unsupported,
                    })
                    .unwrap_or(ColorKind::Unsupported),
                b"CalRGB" => ColorKind::Rgb,
                b"CalGray" => ColorKind::Gray,
                // Indexed / Separation / DeviceN / Lab / unknown — out of v1 scope.
                _ => ColorKind::Unsupported,
            }
        }
        _ => ColorKind::Unsupported,
    }
}

fn classify_colorspace(doc: &Document, dict: &Dictionary) -> ColorKind {
    let Ok(cs) = dict.get(b"ColorSpace") else {
        return ColorKind::Unsupported;
    };
    match cs {
        Object::Reference(id) => match doc.get_object(*id) {
            Ok(resolved) => classify_resolved(doc, resolved),
            Err(_) => ColorKind::Unsupported,
        },
        other => classify_resolved(doc, other),
    }
}

fn filter_names(dict: &Dictionary) -> Vec<Vec<u8>> {
    match dict.get(b"Filter") {
        Ok(Object::Name(n)) => vec![n.clone()],
        Ok(Object::Array(arr)) => arr.iter().filter_map(|o| o.as_name().ok().map(|n| n.to_vec())).collect(),
        _ => vec![],
    }
}

fn rgb_to_luma(r: f32, g: f32, b: f32) -> u8 {
    (0.299 * r + 0.587 * g + 0.114 * b).round().clamp(0.0, 255.0) as u8
}

/// Decode raw (already-decompressed) packed samples into a grayscale buffer.
/// Only handles the common 8-bit-per-component case; anything else bails out
/// so the caller can skip the image instead of guessing.
fn samples_to_gray(raw: &[u8], width: u32, height: u32, channels: usize) -> Option<GrayImage> {
    let expected_len = (width as usize) * (height as usize) * channels;
    if raw.len() < expected_len {
        return None;
    }
    let mut buf = Vec::with_capacity((width as usize) * (height as usize));
    for px in raw[..expected_len].chunks_exact(channels) {
        let luma = match channels {
            3 => rgb_to_luma(px[0] as f32, px[1] as f32, px[2] as f32),
            4 => {
                let c = px[0] as f32 / 255.0;
                let m = px[1] as f32 / 255.0;
                let y = px[2] as f32 / 255.0;
                let k = px[3] as f32 / 255.0;
                let r = 255.0 * (1.0 - c) * (1.0 - k);
                let g = 255.0 * (1.0 - m) * (1.0 - k);
                let b = 255.0 * (1.0 - y) * (1.0 - k);
                rgb_to_luma(r, g, b)
            }
            _ => return None,
        };
        buf.push(luma);
    }
    GrayImage::from_raw(width, height, buf)
}

fn encode_gray_jpeg(image: &GrayImage) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    encoder
        .write_image(image.as_raw(), image.width(), image.height(), ExtendedColorType::L8)
        .ok()?;
    Some(out)
}

enum ImageOutcome {
    /// Not an Image XObject (e.g. a Form) — doesn't count toward totals.
    NotImage,
    Converted(Vec<u8>),
    Skipped,
}

/// Decide what to do with one image XObject: convert it to a smaller
/// grayscale JPEG, or leave it untouched. Never panics/propagates on
/// malformed or unsupported image data — worst case is "skipped".
fn process_image(doc: &Document, id: ObjectId, chrome: &HashSet<ObjectId>) -> ImageOutcome {
    let Ok(stream) = doc.get_object(id).and_then(Object::as_stream) else {
        return ImageOutcome::NotImage;
    };
    let dict = &stream.dict;
    if dict.get(b"Subtype").and_then(Object::as_name).ok() != Some(b"Image".as_slice()) {
        return ImageOutcome::NotImage;
    }

    // Repeated header/footer/watermark image — only convert body content.
    if chrome.contains(&id) {
        return ImageOutcome::Skipped;
    }

    if matches!(classify_colorspace(doc, dict), ColorKind::Gray | ColorKind::Unsupported) {
        return ImageOutcome::Skipped;
    }

    let filters = filter_names(dict);
    if filters
        .iter()
        .any(|f| f.as_slice() == b"CCITTFaxDecode" || f.as_slice() == b"JBIG2Decode" || f.as_slice() == b"JPXDecode")
    {
        return ImageOutcome::Skipped;
    }

    let gray = if filters.iter().any(|f| f.as_slice() == b"DCTDecode") {
        match image::load_from_memory_with_format(&stream.content, image::ImageFormat::Jpeg) {
            Ok(img) => img.into_luma8(),
            Err(_) => return ImageOutcome::Skipped,
        }
    } else {
        let raw = if filters.is_empty() {
            stream.content.clone()
        } else {
            match stream.decompressed_content() {
                Ok(d) => d,
                Err(_) => return ImageOutcome::Skipped,
            }
        };
        let Ok(width) = dict.get(b"Width").and_then(Object::as_i64) else {
            return ImageOutcome::Skipped;
        };
        let Ok(height) = dict.get(b"Height").and_then(Object::as_i64) else {
            return ImageOutcome::Skipped;
        };
        if width <= 0 || height <= 0 {
            return ImageOutcome::Skipped;
        }
        let bpc = dict.get(b"BitsPerComponent").and_then(Object::as_i64).unwrap_or(8);
        if bpc != 8 {
            return ImageOutcome::Skipped;
        }
        let channels = match classify_colorspace(doc, dict) {
            ColorKind::Rgb => 3,
            ColorKind::Cmyk => 4,
            _ => return ImageOutcome::Skipped,
        };
        match samples_to_gray(&raw, width as u32, height as u32, channels) {
            Some(g) => g,
            None => return ImageOutcome::Skipped,
        }
    };

    match encode_gray_jpeg(&gray) {
        Some(bytes) if bytes.len() < stream.content.len() => ImageOutcome::Converted(bytes),
        _ => ImageOutcome::Skipped,
    }
}

/// Every unique Image XObject reachable from a page's own or inherited
/// `/Resources/XObject`, in first-seen order. Images shared across pages
/// (the common case for logos/letterheads) are only visited once.
fn collect_image_ids(doc: &Document) -> Vec<ObjectId> {
    let mut seen = HashSet::new();
    let mut ids = Vec::new();

    for (_, page_id) in doc.get_pages() {
        let Ok((resource_dict, resource_ids)) = doc.get_page_resources(page_id) else {
            continue;
        };
        let mut dicts: Vec<&Dictionary> = resource_dict.into_iter().collect();
        dicts.extend(resource_ids.iter().filter_map(|id| doc.get_dictionary(*id).ok()));

        for res_dict in dicts {
            let xobject = match res_dict.get(b"XObject") {
                Ok(Object::Dictionary(d)) => Some(d),
                Ok(Object::Reference(rid)) => doc.get_dictionary(*rid).ok(),
                _ => None,
            };
            let Some(xobject) = xobject else { continue };
            for (_, value) in xobject.iter() {
                if let Ok(id) = value.as_reference() {
                    if seen.insert(id) {
                        ids.push(id);
                    }
                }
            }
        }
    }

    ids
}

/// Convert every color image in `source_path` to a smaller grayscale JPEG
/// and save the result as a brand-new file at `output_path` — `source_path`
/// is only ever opened for reading, never written, so the original file is
/// untouched no matter what happens.
///
/// If there is nothing to convert, no file is created at `output_path` and
/// `GrayscaleResult::output_path` comes back `None`.
pub fn grayscale_images(source_path: &str, output_path: &str) -> Result<GrayscaleResult, AppError> {
    let mut doc = load_document(source_path)?;
    let original_size = fs::metadata(source_path)?.len();

    let image_ids = collect_image_ids(&doc);
    let chrome_ids = detect_margin_chrome(&doc, &image_ids);
    let mut total = 0u32;
    let mut converted: Vec<(ObjectId, Vec<u8>)> = Vec::new();
    for id in image_ids {
        match process_image(&doc, id, &chrome_ids) {
            ImageOutcome::NotImage => {}
            ImageOutcome::Skipped => total += 1,
            ImageOutcome::Converted(bytes) => {
                total += 1;
                converted.push((id, bytes));
            }
        }
    }
    let images_converted = converted.len() as u32;
    let images_skipped = total - images_converted;

    if converted.is_empty() {
        return Ok(GrayscaleResult {
            images_total: total,
            images_converted: 0,
            images_skipped,
            original_size,
            new_size: original_size,
            output_path: None,
        });
    }

    for (id, bytes) in &converted {
        if let Ok(stream) = doc.get_object_mut(*id).and_then(Object::as_stream_mut) {
            stream.dict.set("Filter", Object::Name(b"DCTDecode".to_vec()));
            stream.dict.set("ColorSpace", Object::Name(b"DeviceGray".to_vec()));
            stream.dict.set("BitsPerComponent", 8i64);
            stream.dict.remove(b"DecodeParms");
            stream.dict.remove(b"Decode");
            stream.dict.remove(b"SMaskInData");
            stream.set_content(bytes.clone());
        }
    }

    save_document(&mut doc, output_path)?;
    let new_size = fs::metadata(output_path)?.len();

    Ok(GrayscaleResult {
        images_total: total,
        images_converted,
        images_skipped,
        original_size,
        new_size,
        output_path: Some(output_path.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};
    use lopdf::{dictionary, content::{Content, Operation}, Stream};

    /// A real (not synthetic-header) color JPEG, built with the same
    /// encoder the rest of the app uses, so the test exercises actual
    /// decode/encode round-trips rather than a hand-rolled fixture.
    fn color_jpeg(width: u32, height: u32) -> Vec<u8> {
        let mut img = RgbImage::new(width, height);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = Rgb([(x % 256) as u8, (y % 256) as u8, 200]);
        }
        let mut out = Vec::new();
        JpegEncoder::new_with_quality(&mut out, 90)
            .write_image(img.as_raw(), width, height, ExtendedColorType::Rgb8)
            .unwrap();
        out
    }

    /// One-page PDF with a single color JPEG XObject image, built from
    /// scratch with lopdf so the test doesn't depend on any fixture file.
    fn build_test_pdf(image_bytes: &[u8], width: i64, height: i64) -> Document {
        let mut doc = Document::with_version("1.5");

        let image_dict = dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => width,
            "Height" => height,
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
            "Filter" => "DCTDecode",
        };
        let image_id = doc.add_object(Stream::new(image_dict, image_bytes.to_vec()));

        let resources_id = doc.add_object(dictionary! {
            "XObject" => dictionary! { "Im0" => image_id },
        });

        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new("cm", vec![width.into(), 0.into(), 0.into(), height.into(), 0.into(), 0.into()]),
                Operation::new("Do", vec!["Im0".into()]),
                Operation::new("Q", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(Dictionary::new(), content.encode().unwrap()));

        let pages_id = doc.new_object_id();
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), width.into(), height.into()],
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
            }),
        );
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        doc
    }

    #[test]
    fn converts_color_jpeg_to_smaller_grayscale_in_a_new_file_and_never_touches_the_source() {
        let jpeg = color_jpeg(400, 300);
        let mut doc = build_test_pdf(&jpeg, 400, 300);

        let source = std::env::temp_dir().join(format!("grayscale-test-src-{}.pdf", uuid::Uuid::new_v4()));
        let output = std::env::temp_dir().join(format!("grayscale-test-out-{}.pdf", uuid::Uuid::new_v4()));
        doc.save(&source).unwrap();
        let source_bytes_before = fs::read(&source).unwrap();
        let original_size = source_bytes_before.len() as u64;

        let source_path = source.to_str().unwrap();
        let output_path = output.to_str().unwrap();
        let result = grayscale_images(source_path, output_path).expect("grayscale_images should succeed");

        assert_eq!(result.images_total, 1);
        assert_eq!(result.images_converted, 1);
        assert_eq!(result.images_skipped, 0);
        assert_eq!(result.output_path.as_deref(), Some(output_path));
        assert!(
            result.new_size <= original_size,
            "converted file ({} bytes) must not be larger than the source ({} bytes)",
            result.new_size,
            original_size
        );

        let source_bytes_after = fs::read(source_path).unwrap();
        assert_eq!(source_bytes_before, source_bytes_after, "source file must never be modified");

        let reloaded = load_document(output_path).unwrap();
        let image_ids = collect_image_ids(&reloaded);
        assert_eq!(image_ids.len(), 1);
        let dict = &reloaded.get_object(image_ids[0]).unwrap().as_stream().unwrap().dict;
        assert!(matches!(classify_colorspace(&reloaded, dict), ColorKind::Gray));
        assert_eq!(dict.get(b"Filter").and_then(Object::as_name).unwrap(), b"DCTDecode");

        fs::remove_file(&source).ok();
        fs::remove_file(&output).ok();
    }

    #[test]
    fn already_gray_image_produces_no_output_file() {
        // A DeviceGray image should never be rewritten, and a document with
        // nothing to convert must not create an output file, nor touch the source.
        let jpeg = color_jpeg(64, 64);
        let gray = image::load_from_memory_with_format(&jpeg, image::ImageFormat::Jpeg)
            .unwrap()
            .into_luma8();
        let mut gray_jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut gray_jpeg, 90)
            .write_image(gray.as_raw(), gray.width(), gray.height(), ExtendedColorType::L8)
            .unwrap();

        let mut doc = Document::with_version("1.5");
        let image_dict = dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => 64i64,
            "Height" => 64i64,
            "ColorSpace" => "DeviceGray",
            "BitsPerComponent" => 8,
            "Filter" => "DCTDecode",
        };
        let image_id = doc.add_object(Stream::new(image_dict, gray_jpeg));
        let resources_id = doc.add_object(dictionary! { "XObject" => dictionary! { "Im0" => image_id } });
        let content_id = doc.add_object(Stream::new(Dictionary::new(), b"q Q".to_vec()));
        let pages_id = doc.new_object_id();
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 64.into(), 64.into()],
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1 }),
        );
        let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        doc.trailer.set("Root", catalog_id);

        let source = std::env::temp_dir().join(format!("grayscale-test-src-{}.pdf", uuid::Uuid::new_v4()));
        let output = std::env::temp_dir().join(format!("grayscale-test-out-{}.pdf", uuid::Uuid::new_v4()));
        doc.save(&source).unwrap();
        let source_path = source.to_str().unwrap();
        let output_path = output.to_str().unwrap();
        let bytes_before = fs::read(source_path).unwrap();

        let result = grayscale_images(source_path, output_path).unwrap();
        assert_eq!(result.images_converted, 0);
        assert!(result.output_path.is_none());
        assert!(!output.exists(), "no output file should be created when there is nothing to convert");

        let bytes_after = fs::read(source_path).unwrap();
        assert_eq!(bytes_before, bytes_after, "source file must not be touched when there is nothing to convert");

        fs::remove_file(&source).ok();
    }

    #[test]
    fn running_header_image_stays_color_while_body_image_turns_gray() {
        let mut doc = Document::with_version("1.5");

        let header_jpeg = color_jpeg(100, 20);
        let header_id = doc.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject", "Subtype" => "Image", "Width" => 100, "Height" => 20,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => "DCTDecode",
            },
            header_jpeg,
        ));
        let body_jpeg = color_jpeg(300, 200);
        let body_id = doc.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject", "Subtype" => "Image", "Width" => 300, "Height" => 200,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => "DCTDecode",
            },
            body_jpeg,
        ));
        let resources_id = doc.add_object(dictionary! {
            "XObject" => dictionary! { "Hdr" => header_id, "Body" => body_id },
        });

        // Header pinned near the top margin on every page; body image large
        // and centered — same layout shape as the `pdf::layout` tests.
        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new("cm", vec![100.into(), 0.into(), 0.into(), 20.into(), 150.into(), 270.into()]),
                Operation::new("Do", vec!["Hdr".into()]),
                Operation::new("Q", vec![]),
                Operation::new("q", vec![]),
                Operation::new("cm", vec![300.into(), 0.into(), 0.into(), 200.into(), 50.into(), 50.into()]),
                Operation::new("Do", vec!["Body".into()]),
                Operation::new("Q", vec![]),
            ],
        };
        let content_bytes = content.encode().unwrap();

        let pages_id = doc.new_object_id();
        let mut kids = Vec::new();
        for _ in 0..2 {
            let content_id = doc.add_object(Stream::new(Dictionary::new(), content_bytes.clone()));
            let page_id = doc.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "Contents" => content_id,
                "Resources" => resources_id,
                "MediaBox" => vec![0.into(), 0.into(), 400.into(), 300.into()],
            });
            kids.push(Object::Reference(page_id));
        }
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 2 }),
        );
        let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        doc.trailer.set("Root", catalog_id);

        let source = std::env::temp_dir().join(format!("grayscale-test-src-{}.pdf", uuid::Uuid::new_v4()));
        let output = std::env::temp_dir().join(format!("grayscale-test-out-{}.pdf", uuid::Uuid::new_v4()));
        doc.save(&source).unwrap();
        let result = grayscale_images(source.to_str().unwrap(), output.to_str().unwrap())
            .expect("grayscale_images should succeed");

        assert_eq!(result.images_total, 2);
        assert_eq!(result.images_converted, 1, "only the body image should convert");
        assert_eq!(result.images_skipped, 1, "the running header must be left alone");

        let reloaded = load_document(output.to_str().unwrap()).unwrap();
        let header_dict = &reloaded.get_object(header_id).unwrap().as_stream().unwrap().dict;
        let body_dict = &reloaded.get_object(body_id).unwrap().as_stream().unwrap().dict;
        assert!(
            matches!(classify_colorspace(&reloaded, header_dict), ColorKind::Rgb),
            "header image must still be RGB, not converted"
        );
        assert!(
            matches!(classify_colorspace(&reloaded, body_dict), ColorKind::Gray),
            "body image must have been converted to grayscale"
        );

        fs::remove_file(&source).ok();
        fs::remove_file(&output).ok();
    }
}
