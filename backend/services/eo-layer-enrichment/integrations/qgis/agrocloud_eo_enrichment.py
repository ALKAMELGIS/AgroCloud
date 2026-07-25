# AgroCloud EO Layer Enrichment — QGIS Processing Algorithm stub
# Place this folder under QGIS Processing scripts or install as a provider.

"""
USAGE (QGIS 3.28+):
1. Processing Toolbox → Scripts → Add Script to Toolbox → select this file
   OR copy into ~/.local/share/QGIS/QGIS3/profiles/default/processing/scripts/
2. Run "AgroCloud EO Enrichment" with an input vector layer.

Requires the `eo_enrichment` package on the QGIS Python path:
  pip install -e /path/to/backend/services/eo-layer-enrichment
"""

from __future__ import annotations

from qgis.core import (  # type: ignore
    QgsProcessingAlgorithm,
    QgsProcessingParameterFile,
    QgsProcessingParameterFolderDestination,
    QgsProcessingParameterNumber,
    QgsProcessingOutputString,
)


class AgroCloudEoEnrichmentAlgorithm(QgsProcessingAlgorithm):
    INPUT = "INPUT"
    OUTPUT_DIR = "OUTPUT_DIR"
    MAX_CLOUD = "MAX_CLOUD"
    RESULT = "RESULT"

    def name(self):
        return "agrocloud_eo_enrichment"

    def displayName(self):
        return "AgroCloud EO Enrichment (Sentinel-2)"

    def group(self):
        return "AgroCloud"

    def groupId(self):
        return "agrocloud"

    def shortHelpString(self):
        return (
            "Enrich KMZ/KML/SHP/GeoJSON/GPKG farm polygons with latest Sentinel-2 "
            "indices, crop heuristics, water stress, and yield proxies."
        )

    def initAlgorithm(self, config=None):
        self.addParameter(
            QgsProcessingParameterFile(self.INPUT, "Input vector (KMZ/KML/SHP/GeoJSON/GPKG)")
        )
        self.addParameter(
            QgsProcessingParameterFolderDestination(self.OUTPUT_DIR, "Output folder")
        )
        self.addParameter(
            QgsProcessingParameterNumber(
                self.MAX_CLOUD,
                "Max cloud cover %",
                type=QgsProcessingParameterNumber.Double,
                defaultValue=20.0,
            )
        )
        self.addOutput(QgsProcessingOutputString(self.RESULT, "Result summary"))

    def processAlgorithm(self, parameters, context, feedback):
        from eo_enrichment.pipeline import EnrichmentConfig, enrich_vector_layer

        inp = self.parameterAsFile(parameters, self.INPUT, context)
        out = self.parameterAsString(parameters, self.OUTPUT_DIR, context)
        cloud = self.parameterAsDouble(parameters, self.MAX_CLOUD, context)

        def progress(msg, pct):
            feedback.setProgress(int(pct))
            feedback.setProgressText(msg)

        result = enrich_vector_layer(
            EnrichmentConfig(
                input_path=inp,
                output_dir=out,
                max_cloud=cloud,
                progress=progress,
            )
        )
        summary = f"{result.output_vector} | scene={result.scene_id}"
        return {self.RESULT: summary}

    def createInstance(self):
        return AgroCloudEoEnrichmentAlgorithm()
