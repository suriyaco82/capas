import React, { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";

const { BaseLayer, Overlay } = LayersControl;

// 📌 Componente para manejar la carga del GeoTIFF en el mapa
const GeoTiffLayer = ({ geoRaster }) => {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!geoRaster) return;

    const layer = new GeoRasterLayer({
      georaster: geoRaster,
      opacity: 0.7,
      resolution: 256,
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [geoRaster, map]);

  return null;
};

const GeoTiffLoader = () => {
  const [geoRaster, setGeoRaster] = useState(null);
  const [fileName, setFileName] = useState("");

  // 📌 Función para cargar el archivo GeoTIFF
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      const georaster = await parseGeoraster(arrayBuffer);
      setGeoRaster(georaster);
    };
  };

  return (
    <div className="container mt-3">
      <h2 className="text-center">Cargar y Visualizar GeoTIFF</h2>

      <div className="row mb-3">
        <div className="col-md-6">
          <input type="file" accept=".tif,.tiff" className="form-control" onChange={handleFileUpload} />
        </div>
        <div className="col-md-6 text-center">
          {fileName && <p className="text-success"><i className="bi bi-file-earmark-image"></i> {fileName} cargado</p>}
        </div>
      </div>

      <MapContainer center={[-29.442260, -66.870089]} zoom={12} style={{ height: "500px", width: "100%" }}>
        <LayersControl position="topright">
          <BaseLayer checked name="Mapa Base">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </BaseLayer>
          {geoRaster && (
            <Overlay checked name="GeoTIFF">
              <GeoTiffLayer geoRaster={geoRaster} />
            </Overlay>
          )}
        </LayersControl>
      </MapContainer>
    </div>
  );
};

export default GeoTiffLoader;
