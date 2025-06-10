"use client";

import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import {
  Box,
  Button,
  Spinner,
  Textarea,
} from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature } from "pigeon-maps";
import wellknown from "wellknown";
import { UseSuccessToast, UseErrorToast } from "@/hooks/Toasts";

export interface BoundaryEditorProps {
  cityId: string;
  locode: string | null;
  cityName: string | null;
  lng: string;
}

const BoundaryEditor: FC<BoundaryEditorProps> = ({ 
  cityId, 
  locode, 
  cityName,
  lng 
}) => {
  const { showSuccessToast } = UseSuccessToast({
    title: "Success",
    description: "Operation completed successfully",
  });
  const { showErrorToast } = UseErrorToast({
    title: "Error",
    description: "An error occurred",
  });
  const { data: originalData, isLoading, error } = api.useGetCityBoundaryQuery(locode!, {
    skip: !locode || locode === null,
  });

  const [center, setCenter] = useState<[number, number]>([34.0, -37.0]);
  const [zoom, setZoom] = useState(11);
  const [modifiedGeometry, setModifiedGeometry] = useState<any>(null);
  const [geoJsonText, setGeoJsonText] = useState("");
  const [isModified, setIsModified] = useState(false);

  const onBoundsChanged = ({
    center: newCenter,
    zoom: newZoom,
  }: {
    center: [number, number];
    zoom: number;
  }) => {
    setCenter(newCenter);
    setZoom(newZoom);
  };

  useEffect(() => {
    if (originalData?.data) {
      setModifiedGeometry(originalData.data);
      setGeoJsonText(JSON.stringify(originalData.data, null, 2));

      if (originalData.boundingBox && !originalData.boundingBox.some(isNaN)) {
        const newZoom = getBoundsZoomLevel(originalData.boundingBox, { width: 800, height: 500 });
        const newCenter: [number, number] = [
          (originalData.boundingBox[1] + originalData.boundingBox[3]) / 2,
          (originalData.boundingBox[0] + originalData.boundingBox[2]) / 2,
        ];
        setCenter(newCenter);
        setZoom(newZoom);
      }
    }
  }, [originalData]);

  const handleGeoJsonChange = (newGeoJson: string) => {
    setGeoJsonText(newGeoJson);
    try {
      const parsed = JSON.parse(newGeoJson);
      setModifiedGeometry(parsed);
      setIsModified(true);
    } catch (e) {
      // Invalid JSON, don't update geometry
    }
  };

  const resetToOriginal = () => {
    if (originalData?.data) {
      setModifiedGeometry(originalData.data);
      setGeoJsonText(JSON.stringify(originalData.data, null, 2));
      setIsModified(false);
    }
  };

  const downloadBoundary = () => {
    if (modifiedGeometry) {
      const dataStr = JSON.stringify(modifiedGeometry, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cityName || cityId}_boundary_modified.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccessToast({
        title: "Boundary Downloaded",
        description: "The modified boundary has been downloaded as a GeoJSON file.",
      });
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          Error Loading Boundary
        </h3>
        <p className="text-red-800">
          Could not load boundary data for this city. The city may not have boundary data available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Interactive Map</h3>
          <Box style={{ width: "100%", height: "500px" }} className="relative border rounded-lg overflow-hidden">
            {isLoading && (
              <Box
                style={{ width: "100%", height: "500px" }}
                className="absolute top-0 left-0 z-[1000] pointer-events-none bg-white bg-opacity-75"
              >
                <div className="flex items-center justify-center h-full"></div>
              </Box>
            )}
            <Map
              height={500}
              center={center}
              zoom={zoom}
              onBoundsChanged={onBoundsChanged}
              attributionPrefix={false}
            >
              {modifiedGeometry && (
                <GeoJson
                  svgAttributes={{
                    fill: isModified ? "#ff648b99" : "#648bff99",
                    strokeWidth: "3",
                    stroke: isModified ? "#ff648b" : "#648bff",
                  }}
                >
                  <GeoJsonFeature feature={{ type: "Feature", geometry: modifiedGeometry }} />
                </GeoJson>
              )}
            </Map>
          </Box>

          {isModified && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 text-sm">
                ⚠️ Boundary has been modified. The map shows your changes in red.
              </p>
            </div>
          )}
        </div>

        {/* Editor Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">GeoJSON Editor</h3>
          <div className="space-y-4">
            <Textarea
              value={geoJsonText}
              onChange={(e) => handleGeoJsonChange(e.target.value)}
              placeholder="GeoJSON geometry will appear here..."
              style={{ 
                minHeight: "400px",
                fontFamily: "monospace",
                fontSize: "14px",
                backgroundColor: "#f9fafb"
              }}
            />

            <div className="flex gap-4">
              <Button
                colorScheme="gray"
                size="sm"
                onClick={resetToOriginal}
                disabled={!isModified}
              >
                Reset to Original
              </Button>
              <Button
                colorScheme="green"
                size="sm"
                onClick={downloadBoundary}
                disabled={!modifiedGeometry}
              >
                Download Boundary
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          Editing Instructions
        </h3>
        <div className="text-blue-800 space-y-2 text-sm">
          <p>• <strong>Manual Editing:</strong> Modify the GeoJSON coordinates in the text editor on the right</p>
          <p>• <strong>Validation:</strong> Invalid GeoJSON will not be displayed on the map</p>
          <p>• <strong>Visual Feedback:</strong> Modified boundaries appear in red on the map</p>
          <p>• <strong>Download:</strong> Save your modified boundary as a GeoJSON file</p>
          <p>• <strong>Reset:</strong> Restore the original boundary at any time</p>
        </div>
      </div>
    </div>
  );
};

export default BoundaryEditor;