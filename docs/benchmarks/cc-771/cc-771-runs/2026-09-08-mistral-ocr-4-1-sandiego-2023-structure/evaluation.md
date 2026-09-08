# Evaluation — 2026-09-08-mistral-ocr-4-1-sandiego-2023-structure

- Status: `ok`
- Model requested: `mistral-ocr-4-1`
- Model returned: `mistral-ocr-4-1`
- Input SHA-256: `3a9281508afff21de1176c18be8f6026e0cd96e4c4db684f57368597f2f06bbd`
- Pages: 20
- Selected annotation pages: None
- OCR latency (s): 4.333
- Annotation latency (s): 0.0
- Total latency (s): 7.73
- OCR cost USD (est.): 0.08
- Annotation cost USD (est.): None
- Total cost USD (est.): 0.08

## Validation

- schema_valid: True
- warnings: 218
- missing_fields: []
- unsupported_provider_features: []

## Structural summary

- page 0: blocks=11; images=1; tables=0; types={'header': 2, 'image': 1, 'title': 2, 'text': 1, 'footer': 5}; header=yes; footer=yes
- page 1: blocks=5; images=1; tables=1; types={'title': 1, 'table': 1, 'image': 1, 'footer': 2}; header=no; footer=yes
- page 2: blocks=13; images=1; tables=0; types={'title': 1, 'text': 8, 'other': 1, 'image': 1, 'footer': 2}; header=no; footer=yes
- page 3: blocks=6; images=1; tables=0; types={'header': 1, 'title': 1, 'text': 1, 'image': 1, 'footer': 2}; header=yes; footer=yes
- page 4: blocks=6; images=1; tables=0; types={'header': 1, 'title': 1, 'text': 1, 'image': 1, 'footer': 2}; header=yes; footer=yes
- page 5: blocks=14; images=6; tables=0; types={'header': 2, 'title': 1, 'image': 6, 'text': 3, 'footer': 2}; header=yes; footer=yes
- page 6: blocks=14; images=3; tables=0; types={'header': 2, 'title': 4, 'text': 3, 'image': 3, 'footer': 2}; header=yes; footer=yes
- page 7: blocks=14; images=3; tables=0; types={'header': 1, 'title': 4, 'text': 4, 'image': 3, 'footer': 2}; header=yes; footer=yes
- page 8: blocks=21; images=5; tables=0; types={'header': 2, 'text': 6, 'title': 3, 'image': 5, 'caption': 3, 'footer': 2}; header=yes; footer=yes
- page 9: blocks=11; images=3; tables=0; types={'header': 1, 'title': 2, 'text': 4, 'image': 3, 'footer': 1}; header=yes; footer=yes
- page 10: blocks=12; images=2; tables=0; types={'header': 1, 'text': 5, 'title': 2, 'image': 2, 'footer': 2}; header=yes; footer=yes
- page 11: blocks=8; images=2; tables=0; types={'header': 1, 'title': 1, 'image': 2, 'text': 3, 'footer': 1}; header=yes; footer=yes
- page 12: blocks=18; images=3; tables=0; types={'header': 1, 'title': 6, 'text': 6, 'image': 3, 'footer': 2}; header=yes; footer=yes
- page 13: blocks=14; images=3; tables=0; types={'header': 2, 'title': 3, 'text': 3, 'list': 1, 'image': 3, 'footer': 2}; header=yes; footer=yes
- page 14: blocks=10; images=2; tables=0; types={'header': 1, 'title': 3, 'text': 2, 'image': 2, 'footer': 2}; header=yes; footer=yes
- page 15: blocks=11; images=2; tables=0; types={'header': 1, 'title': 2, 'text': 5, 'image': 2, 'footer': 1}; header=yes; footer=yes
- page 16: blocks=9; images=2; tables=0; types={'header': 1, 'text': 4, 'image': 2, 'footer': 2}; header=yes; footer=yes
- page 17: blocks=9; images=1; tables=0; types={'header': 1, 'title': 1, 'text': 4, 'image': 1, 'footer': 2}; header=yes; footer=yes
- page 18: blocks=7; images=1; tables=0; types={'header': 1, 'title': 1, 'text': 1, 'list': 1, 'image': 1, 'footer': 2}; header=yes; footer=yes
- page 19: blocks=5; images=2; tables=0; types={'image': 2, 'text': 2, 'footer': 1}; header=no; footer=yes

## Relationships

- rel-p8-p8-b10-p8-b11: caption_of_image (p8-b11 -> p8-b10) provenance=derived rule=nearest_caption_same_page

## Visual annotations

- page 0 `img-0.jpeg`: kind=None; error=None
- page 1 `img-1.jpeg`: kind=None; error=None
- page 2 `img-2.jpeg`: kind=None; error=None
- page 3 `img-3.jpeg`: kind=None; error=None
- page 4 `img-4.jpeg`: kind=None; error=None
- page 5 `img-5.jpeg`: kind=None; error=None
- page 5 `img-6.jpeg`: kind=None; error=None
- page 5 `img-7.jpeg`: kind=None; error=None
- page 5 `img-8.jpeg`: kind=None; error=None
- page 5 `img-9.jpeg`: kind=None; error=None
- page 5 `img-10.jpeg`: kind=None; error=None
- page 6 `img-11.jpeg`: kind=None; error=None
- page 6 `img-12.jpeg`: kind=None; error=None
- page 6 `img-13.jpeg`: kind=None; error=None
- page 7 `img-14.jpeg`: kind=None; error=None
- page 7 `img-15.jpeg`: kind=None; error=None
- page 7 `img-16.jpeg`: kind=None; error=None
- page 8 `img-17.jpeg`: kind=None; error=None
- page 8 `img-18.jpeg`: kind=None; error=None
- page 8 `img-19.jpeg`: kind=None; error=None
- page 8 `img-20.jpeg`: kind=None; error=None
- page 8 `img-21.jpeg`: kind=None; error=None
- page 9 `img-22.jpeg`: kind=None; error=None
- page 9 `img-23.jpeg`: kind=None; error=None
- page 9 `img-24.jpeg`: kind=None; error=None
- page 10 `img-25.jpeg`: kind=None; error=None
- page 10 `img-26.jpeg`: kind=None; error=None
- page 11 `img-27.jpeg`: kind=None; error=None
- page 11 `img-28.jpeg`: kind=None; error=None
- page 12 `img-29.jpeg`: kind=None; error=None
- page 12 `img-30.jpeg`: kind=None; error=None
- page 12 `img-31.jpeg`: kind=None; error=None
- page 13 `img-32.jpeg`: kind=None; error=None
- page 13 `img-33.jpeg`: kind=None; error=None
- page 13 `img-34.jpeg`: kind=None; error=None
- page 14 `img-35.jpeg`: kind=None; error=None
- page 14 `img-36.jpeg`: kind=None; error=None
- page 15 `img-37.jpeg`: kind=None; error=None
- page 15 `img-38.jpeg`: kind=None; error=None
- page 16 `img-39.jpeg`: kind=None; error=None
- page 16 `img-40.jpeg`: kind=None; error=None
- page 17 `img-41.jpeg`: kind=None; error=None
- page 18 `img-42.jpeg`: kind=None; error=None
- page 19 `img-43.jpeg`: kind=None; error=None
- page 19 `img-44.jpeg`: kind=None; error=None

## Semantic / chart facts

Evaluate expected versus observed against chart ground truth when this run includes the controlled fixture chart.

No chart ground-truth file attached for this input.

## Verdict

Fill after manual review of overlays and chart facts. A partial or negative result is valid when evidence is complete.
