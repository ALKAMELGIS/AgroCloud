"""Unit tests for temporal crop property merge (pure, no FastAPI)."""

from __future__ import annotations

import unittest

from app import merge_crop_props


class TemporalMergeTests(unittest.TestCase):
    def test_majority_crop_attached(self) -> None:
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"Feature_ID": "SF-00001", "Class_Name": "Agricultural Field"},
                    "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
                }
            ],
        }
        out = merge_crop_props(
            fc,
            majority_class_name="Wheat",
            majority_confidence=0.7,
            dates=["2024-06-01", "2024-06-15"],
        )
        props = out["features"][0]["properties"]
        self.assertEqual(props["Crop_Type"], "Wheat")
        self.assertAlmostEqual(props["Crop_Confidence"], 0.7)
        self.assertIn("2024-06-01", props["Temporal_Dates"])

    def test_per_feature_override(self) -> None:
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"Feature_ID": "SF-00001"},
                    "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
                }
            ],
        }
        out = merge_crop_props(
            fc,
            crop_by_feature_id={"SF-00001": {"cropType": "Rice", "confidence": 0.91}},
            majority_class_name="Corn",
        )
        self.assertEqual(out["features"][0]["properties"]["Crop_Type"], "Rice")
        self.assertAlmostEqual(out["features"][0]["properties"]["Crop_Confidence"], 0.91)


if __name__ == "__main__":
    unittest.main()
