use std::collections::{HashMap, HashSet};

use lopdf::{Dictionary, Document, Object, ObjectId};

/// 2D affine transform in PDF's row-vector convention:
/// `(x', y') = (a*x + c*y + e, b*x + d*y + f)`.
#[derive(Clone, Copy)]
struct Matrix([f64; 6]);

impl Matrix {
    fn identity() -> Self {
        Matrix([1.0, 0.0, 0.0, 1.0, 0.0, 0.0])
    }

    /// Compose `self` applied first, then `other` — matches the PDF `cm`
    /// operator's semantics (`CTM' = M x CTM`, `M` closer to the object).
    fn then(self, other: Matrix) -> Matrix {
        let [a1, b1, c1, d1, e1, f1] = self.0;
        let [a2, b2, c2, d2, e2, f2] = other.0;
        Matrix([
            a1 * a2 + b1 * c2,
            a1 * b2 + b1 * d2,
            c1 * a2 + d1 * c2,
            c1 * b2 + d1 * d2,
            e1 * a2 + f1 * c2 + e2,
            e1 * b2 + f1 * d2 + f2,
        ])
    }

    fn apply(self, x: f64, y: f64) -> (f64, f64) {
        let [a, b, c, d, e, f] = self.0;
        (a * x + c * y + e, b * x + d * y + f)
    }
}

fn as_f64(obj: &Object) -> Option<f64> {
    match obj {
        Object::Integer(i) => Some(*i as f64),
        Object::Real(r) => Some(*r as f64),
        _ => None,
    }
}

/// The page's own or inherited `/MediaBox`, falling back to US Letter if it
/// can't be resolved — malformed page trees shouldn't abort the whole scan.
fn page_media_box(doc: &Document, page_id: ObjectId) -> (f64, f64, f64, f64) {
    const DEFAULT: (f64, f64, f64, f64) = (0.0, 0.0, 612.0, 792.0);
    let mut current = doc.get_dictionary(page_id).ok();
    let mut seen = HashSet::new();
    seen.insert(page_id);
    while let Some(dict) = current {
        if let Ok(Object::Array(arr)) = dict.get(b"MediaBox") {
            if arr.len() == 4 {
                if let (Some(x0), Some(y0), Some(x1), Some(y1)) =
                    (as_f64(&arr[0]), as_f64(&arr[1]), as_f64(&arr[2]), as_f64(&arr[3]))
                {
                    return (x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1));
                }
            }
        }
        current = match dict.get(b"Parent").and_then(Object::as_reference) {
            Ok(parent_id) if seen.insert(parent_id) => doc.get_dictionary(parent_id).ok(),
            _ => None,
        };
    }
    DEFAULT
}

/// Name -> ObjectId map for one page's own+inherited `/Resources/XObject`.
fn page_xobject_map(doc: &Document, page_id: ObjectId) -> HashMap<Vec<u8>, ObjectId> {
    let mut map = HashMap::new();
    let Ok((resource_dict, resource_ids)) = doc.get_page_resources(page_id) else {
        return map;
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
        for (name, value) in xobject.iter() {
            if let Ok(id) = value.as_reference() {
                map.entry(name.clone()).or_insert(id);
            }
        }
    }
    map
}

struct Placement {
    /// Distance from the page's top/bottom edge, as a fraction of page
    /// height (0 = flush against that edge, 1 = the far edge).
    top_frac: f64,
    bottom_frac: f64,
    /// Placed height as a fraction of page height.
    height_frac: f64,
}

/// How close to a page edge counts as "margin", and how small an image has
/// to be (relative to page height) to plausibly be a logo/page-number/rule
/// rather than body content. Both are deliberately generous — this only
/// needs to catch the common case, and understating it (leaving a real
/// header image untouched) is a much smaller mistake than overstating it
/// (accidentally skipping body content the user asked to convert).
const MARGIN_BAND: f64 = 0.15;
const MAX_CHROME_HEIGHT: f64 = 0.25;

fn is_margin_confined(p: &Placement) -> bool {
    p.height_frac <= MAX_CHROME_HEIGHT && (p.top_frac <= MARGIN_BAND || p.bottom_frac <= MARGIN_BAND)
}

/// Walk every page's content stream, tracking the CTM through `q`/`Q`/`cm`,
/// and record where each candidate image is actually drawn (`Do`). Only
/// looks at each page's own top-level content stream — images nested
/// inside Form XObjects/patterns aren't visited (same scope limit as
/// `grayscale::collect_image_ids`).
fn collect_placements(doc: &Document, candidates: &HashSet<ObjectId>) -> HashMap<ObjectId, Vec<(ObjectId, Placement)>> {
    let mut placements: HashMap<ObjectId, Vec<(ObjectId, Placement)>> = HashMap::new();

    for (_, page_id) in doc.get_pages() {
        let xobjects = page_xobject_map(doc, page_id);
        if xobjects.is_empty() {
            continue;
        }
        let (_x0, y0, _x1, y1) = page_media_box(doc, page_id);
        let page_height = (y1 - y0).max(1.0);

        let Ok(content) = doc.get_and_decode_page_content(page_id) else {
            continue;
        };

        let mut ctm = Matrix::identity();
        let mut stack: Vec<Matrix> = Vec::new();

        for op in &content.operations {
            match op.operator.as_str() {
                "q" => stack.push(ctm),
                "Q" => {
                    if let Some(m) = stack.pop() {
                        ctm = m;
                    }
                }
                "cm" if op.operands.len() == 6 => {
                    let vals: Option<Vec<f64>> = op.operands.iter().map(as_f64).collect();
                    if let Some(v) = vals {
                        ctm = Matrix([v[0], v[1], v[2], v[3], v[4], v[5]]).then(ctm);
                    }
                }
                "Do" => {
                    let Some(Object::Name(name)) = op.operands.first() else { continue };
                    let Some(&xid) = xobjects.get(name) else { continue };
                    if !candidates.contains(&xid) {
                        continue;
                    }
                    let ys: Vec<f64> = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]
                        .iter()
                        .map(|&(x, y)| ctm.apply(x, y).1)
                        .collect();
                    let min_y = ys.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max_y = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    placements.entry(xid).or_default().push((
                        page_id,
                        Placement {
                            top_frac: ((y1 - max_y) / page_height).clamp(0.0, 1.0),
                            bottom_frac: ((min_y - y0) / page_height).clamp(0.0, 1.0),
                            height_frac: ((max_y - min_y) / page_height).clamp(0.0, 1.0),
                        },
                    ));
                }
                _ => {}
            }
        }
    }

    placements
}

/// Images that behave like a running header/footer/watermark: reused
/// verbatim across at least two pages, always small, and always pinned to
/// the same margin band (all near the top edge, or all near the bottom —
/// never a mix). This is a heuristic, not a semantic reading of the PDF
/// (PDF has no notion of "header region"), but it matches how header/footer
/// content is actually produced by every mainstream generator (Word,
/// LibreOffice, WPS, …): the same image object placed at the same spot on
/// every page. A one-off image that happens to sit near a page edge on a
/// single page is left as body content — reused-and-consistently-placed is
/// the signal, not position alone.
pub fn detect_margin_chrome(doc: &Document, image_ids: &[ObjectId]) -> HashSet<ObjectId> {
    let candidates: HashSet<ObjectId> = image_ids.iter().copied().collect();
    let placements = collect_placements(doc, &candidates);

    let mut chrome = HashSet::new();
    for (id, uses) in placements {
        let distinct_pages: HashSet<ObjectId> = uses.iter().map(|(page_id, _)| *page_id).collect();
        if distinct_pages.len() < 2 {
            continue;
        }
        if !uses.iter().all(|(_, p)| is_margin_confined(p)) {
            continue;
        }
        let all_top = uses.iter().all(|(_, p)| p.top_frac <= MARGIN_BAND);
        let all_bottom = uses.iter().all(|(_, p)| p.bottom_frac <= MARGIN_BAND);
        if all_top || all_bottom {
            chrome.insert(id);
        }
    }
    chrome
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::content::{Content, Operation};
    use lopdf::{dictionary, Stream};

    /// `cm` params to place a `w`x`h` unit square at `(x, y)` in page space.
    fn place(x: f64, y: f64, w: f64, h: f64) -> Operation {
        Operation::new("cm", vec![w.into(), 0.0.into(), 0.0.into(), h.into(), x.into(), y.into()])
    }

    fn do_op(name: &str) -> Operation {
        Operation::new("Do", vec![name.into()])
    }

    /// A 3-page, 400x300 document where `header_id` is drawn identically
    /// near the top of every page (a running header) and `body_id` is drawn
    /// identically too, but large and centered (a repeated but non-chrome
    /// image — reused across pages alone must not be enough to flag it).
    fn build_three_page_doc() -> (Document, ObjectId, ObjectId) {
        let mut doc = Document::with_version("1.5");
        let header_id = doc.add_object(Stream::new(
            dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 100, "Height" => 20,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8 },
            vec![0u8; 10],
        ));
        let body_id = doc.add_object(Stream::new(
            dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 300, "Height" => 200,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8 },
            vec![0u8; 10],
        ));
        let resources_id = doc.add_object(dictionary! {
            "XObject" => dictionary! { "Hdr" => header_id, "Body" => body_id },
        });

        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                place(150.0, 270.0, 100.0, 20.0),
                do_op("Hdr"),
                Operation::new("Q", vec![]),
                Operation::new("q", vec![]),
                place(50.0, 50.0, 300.0, 200.0),
                do_op("Body"),
                Operation::new("Q", vec![]),
            ],
        };
        let content_bytes = content.encode().unwrap();

        let pages_id = doc.new_object_id();
        let mut kids = Vec::new();
        for _ in 0..3 {
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
            Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 3 }),
        );
        let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        doc.trailer.set("Root", catalog_id);

        (doc, header_id, body_id)
    }

    #[test]
    fn flags_repeated_margin_image_but_not_repeated_body_image() {
        let (doc, header_id, body_id) = build_three_page_doc();
        let chrome = detect_margin_chrome(&doc, &[header_id, body_id]);
        assert!(chrome.contains(&header_id), "small image repeated at the same top margin should be flagged");
        assert!(!chrome.contains(&body_id), "large centered image should never be flagged, even if reused");
    }

    #[test]
    fn single_page_image_is_never_flagged() {
        let mut doc = Document::with_version("1.5");
        let image_id = doc.add_object(Stream::new(
            dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 100, "Height" => 20,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8 },
            vec![0u8; 10],
        ));
        let resources_id = doc.add_object(dictionary! { "XObject" => dictionary! { "Hdr" => image_id } });
        let content = Content {
            operations: vec![Operation::new("q", vec![]), place(150.0, 270.0, 100.0, 20.0), do_op("Hdr"), Operation::new("Q", vec![])],
        };
        let content_id = doc.add_object(Stream::new(Dictionary::new(), content.encode().unwrap()));
        let pages_id = doc.new_object_id();
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 400.into(), 300.into()],
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1 }),
        );
        let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        doc.trailer.set("Root", catalog_id);

        let chrome = detect_margin_chrome(&doc, &[image_id]);
        assert!(chrome.is_empty(), "an image used on only one page is never treated as chrome");
    }
}
