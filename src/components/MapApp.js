import React, { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, LayersControl, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import shp from "shpjs";
import proj4 from "proj4";
import * as XLSX from "xlsx";
import "./styles.css";
import Alert from "react-bootstrap/Alert";
import L from "leaflet";

const { BaseLayer, Overlay } = LayersControl;

// Validar coordenadas antes de reproyectar
const isValidCoordinate = (coord) => {
  return Array.isArray(coord) && coord.length === 2 && coord.every((val) => typeof val === "number" && isFinite(val));
};

// Convertir coordenadas UTM a geográficas
const convertToGeographic = (geojson) => {
  const srcProjection = "+proj=utm +zone=18 +datum=WGS84";
  const destProjection = "+proj=longlat +datum=WGS84";

  return {
    ...geojson,
    features: geojson.features.map((feature, index) => {
      let newFeature = { ...feature, id: index };

      if (feature.geometry.type === "Point" && isValidCoordinate(feature.geometry.coordinates)) {
        newFeature.geometry.coordinates = proj4(srcProjection, destProjection, feature.geometry.coordinates);
      } else if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
        newFeature.geometry.coordinates = feature.geometry.coordinates.map((polygon) =>
          polygon.map((ring) =>
            ring.map((coord) =>
              isValidCoordinate(coord) ? proj4(srcProjection, destProjection, [...coord]) : coord
            )
          )
        );
      }
      return newFeature;
    }),
  };
};

// Función para determinar el color según el saldo (para el mapa temático)
const getColorForValue = (value) => {
  if (!value) return "#FFFFFF"; // Blanco para valores nulos o indefinidos

  if (value > 100000) return "#8B0000"; // Rojo muy oscuro (Bordeaux)
  if (value > 15000) return "#FF0012"; // Rojo oscuro
  if (value > 10000) return "#FF4500"; // Naranja oscuro
  if (value > 5000) return "#FF8C00"; // Naranja medio
  if (value > 2000) return "#FFA500"; // Naranja claro
  if (value > 1000) return "#FFFF00"; // Amarillo
  if (value > 500) return "#00FF00"; // Verde
  if (value > 400) return "#ADD8E6"; // Azul claro
  if (value > 300) return "#87CEEB"; // Azul cielo
  if (value > 200) return "#6495ED"; // Azul medio
  if (value > 100) return "#4169E1"; // Azul real
  return "#00008B"; // Azul oscuro
};

// Componente optimizado para mostrar capas GeoJSON con selección y mapa temático
const MemoizedGeoJSON = React.memo(({ data, selectedFeatureIds, handleFeatureClick, thematic }) => {
  return (
    <GeoJSON
      data={data}
      style={(feature) => ({
        fillColor: thematic
          ? getColorForValue(feature.properties?.saldo || feature.properties?.saldos)
          : selectedFeatureIds.includes(feature.id)
          ? "#FFA500"
          : "#3388ff",
        color: "black",
        weight: 0.5,
        fillOpacity: thematic ? 0.5 : selectedFeatureIds.includes(feature.id) ? 0.6 : 0.5,
      })}
      onEachFeature={(feature, layer) => {
        layer.on("click", () => handleFeatureClick(feature));
      }}
    />
  );
});

// Componente para la leyenda del mapa temático
const Legend = ({ onClose }) => {
  return (
    <div className="legend position-absolute bottom-0 end-0 m-3 bg-white p-3 rounded shadow">
      <button onClick={onClose} className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1">
        <i className="bi bi-x"></i>
      </button>
      <h5>Leyenda</h5>
      <div><span style={{ backgroundColor: "#8B0000" }}></span>Deuda > 100,000</div>
      <div><span style={{ backgroundColor: "#FF0012" }}></span>Deuda 15,001 - 100,000</div>
      <div><span style={{ backgroundColor: "#FF4500" }}></span>Deuda 10,001 - 15,000</div>
      <div><span style={{ backgroundColor: "#FF8C00" }}></span>Deuda 5,001 - 10,000</div>
      <div><span style={{ backgroundColor: "#FFA500" }}></span>Deuda 2,001 - 5,000</div>
      <div><span style={{ backgroundColor: "#FFFF00" }}></span>Deuda 1,001 - 2,000</div>
      <div><span style={{ backgroundColor: "#00FF00" }}></span>Deuda 501 - 1,000</div>
      <div><span style={{ backgroundColor: "#ADD8E6" }}></span>Deuda 401 - 500</div>
      <div><span style={{ backgroundColor: "#87CEEB" }}></span>Deuda 301 - 400</div>
      <div><span style={{ backgroundColor: "#6495ED" }}></span>Deuda 201 - 300</div>
      <div><span style={{ backgroundColor: "#4169E1" }}></span>Deuda 101 - 200</div>
      <div><span style={{ backgroundColor: "#00008B" }}></span>Deuda ≤ 100</div>
    </div>
  );
};

const MapApp = () => {
  const [layers, setLayers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
  const [codSerFilter, setCodSerFilter] = useState("");
  const [barrioFilter, setBarrioFilter] = useState("");
  const [calleFilter, setCalleFilter] = useState("");
  const [unidadFilter, setUnidadFilter] = useState("");
  const [saldoFilter, setSaldoFilter] = useState({ min: 100.00, max: 1000000.00 });
  const [thematic, setThematic] = useState(false);
  const [popupData, setPopupData] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [showLegend, setShowLegend] = useState(true); // Estado para controlar la visibilidad de la leyenda
  const mapRef = useRef(null);
  const popupRef = useRef(null); // Referencia para el popup en móviles

  // Manejo de selección de archivo
  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  // Cargar SHP y convertir a GeoJSON
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setAlertMessage({ type: "danger", message: "Selecciona un archivo antes de cargar." });
      return;
    }

    setLoading(true);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      let geojson = await shp(arrayBuffer);

      if (!geojson || !geojson.features) {
        throw new Error("El archivo SHP no contiene datos válidos.");
      }

      geojson = convertToGeographic(geojson);
      geojson.features = geojson.features.map((feature, index) => ({ ...feature, id: index }));

      setLayers((prevLayers) => [...prevLayers, { id: Date.now(), name: selectedFile.name, data: geojson }]);
      setSelectedFeatureIds([]);

      setAlertMessage({ type: "success", message: `Capa "${selectedFile.name}" cargada correctamente.` });
    } catch (error) {
      console.error("Error al cargar el archivo SHP:", error);
      setAlertMessage({ type: "danger", message: "Error al procesar el archivo SHP." });
    } finally {
      setLoading(false);
    }
  };

  // Función para actualizar la capa (refrescar la carga)
  const handleRefresh = async () => {
    if (!selectedFile) {
      setAlertMessage({ type: "danger", message: "No hay archivo seleccionado para recargar." });
      return;
    }

    setLoading(true);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      let geojson = await shp(arrayBuffer);

      if (!geojson || !geojson.features) {
        throw new Error("El archivo SHP no contiene datos válidos.");
      }

      geojson = convertToGeographic(geojson);
      geojson.features = geojson.features.map((feature, index) => ({ ...feature, id: index }));

      setLayers((prevLayers) => [...prevLayers, { id: Date.now(), name: selectedFile.name, data: geojson }]);
      setSelectedFeatureIds([]);

      setAlertMessage({ type: "success", message: `Capa "${selectedFile.name}" recargada correctamente.` });
    } catch (error) {
      console.error("Error al recargar el archivo SHP:", error);
      setAlertMessage({ type: "danger", message: "Error al procesar el archivo SHP." });
    } finally {
      setLoading(false);
    }
  };

  // Filtrar características por barrio, calle, cod_ser, unidad y saldo
  useEffect(() => {
    if (layers.length > 0) {
      const filtered = layers.flatMap((layer) =>
        layer.data.features.filter((feature) =>
          (!codSerFilter || feature.properties?.cod_ser?.toString().includes(codSerFilter)) &&
          (!barrioFilter || feature.properties?.barrio?.toString().toLowerCase().includes(barrioFilter.toLowerCase())) &&
          (!calleFilter || feature.properties?.calle?.toString().toLowerCase().includes(calleFilter.toLowerCase())) &&
          (!unidadFilter || feature.properties?.unidad?.toString().toLowerCase().includes(unidadFilter.toLowerCase())) &&
          (feature.properties?.saldo >= saldoFilter.min && feature.properties?.saldo <= saldoFilter.max)
        )
      );
      setSelectedFeatureIds(filtered.map((feature) => feature.id));

      // Hacer zoom al polígono encontrado si se filtra por unidad
      if (unidadFilter && filtered.length > 0) {
        const firstFeature = filtered[0];
        const layer = L.geoJSON(firstFeature);
        const bounds = layer.getBounds();
        if (mapRef.current) {
          mapRef.current.flyToBounds(bounds, { padding: [50, 50] });
        }
        setPopupData(firstFeature.properties);
      }
    }
  }, [codSerFilter, barrioFilter, calleFilter, unidadFilter, saldoFilter, layers]);

  // Mostrar datos en ventana emergente al hacer clic en una parcela
  const handleFeatureClick = useCallback((feature) => {
    setPopupData(feature.properties);
    if (window.innerWidth <= 768 && feature.geometry) {
      const layer = L.geoJSON(feature);
      const bounds = layer.getBounds();
      if (mapRef.current) {
        mapRef.current.flyToBounds(bounds, { padding: [50, 50] });
      }
    }
  }, []);

  // Obtener las características filtradas
  const getFilteredFeatures = () => {
    if (layers.length === 0) return [];
    return layers.flatMap((layer) =>
      layer.data.features.filter((feature) =>
        (!codSerFilter || feature.properties?.cod_ser?.toString().includes(codSerFilter)) &&
        (!barrioFilter || feature.properties?.barrio?.toString().toLowerCase().includes(barrioFilter.toLowerCase())) &&
        (!calleFilter || feature.properties?.calle?.toString().toLowerCase().includes(calleFilter.toLowerCase())) &&
        (!unidadFilter || feature.properties?.unidad?.toString().toLowerCase().includes(unidadFilter.toLowerCase())) &&
        (feature.properties?.saldo >= saldoFilter.min && feature.properties?.saldo <= saldoFilter.max)
      )
    );
  };

  const exportToExcel = () => {
    const filteredFeatures = getFilteredFeatures();
    if (filteredFeatures.length === 0) {
      setAlertMessage({ type: "warning", message: "No hay datos filtrados para exportar." });
      return;
    }

    const data = filteredFeatures.map((feature) => feature.properties);
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Datos Filtrados");
    XLSX.writeFile(workbook, "DatosFiltrados.xlsx");

    setAlertMessage({ type: "success", message: "Archivo Excel generado correctamente." });
  };

  return (
    <div className="container mt-3">
      <h2 className="text-center">Análisis de Datos con GIS</h2>

      {alertMessage && (
        <Alert variant={alertMessage.type} onClose={() => setAlertMessage(null)} dismissible>
          {alertMessage.message}
        </Alert>
      )}

      <div className="row">
        <div className="col-md-6">
          <input type="file" accept=".shp,.zip" onChange={handleFileSelect} className="form-control" />
        </div>
        <div className="col-md-6 text-center">
          <button onClick={handleFileUpload} disabled={!selectedFile || loading} className="btn btn-primary">
            <i className="bi bi-upload me-2"></i> {loading ? "Cargando..." : "Cargar Capa"}
          </button>
          <button onClick={() => setThematic(!thematic)} className="btn btn-secondary ms-2">
            <i className={`bi ${thematic ? "bi-eye" : "bi-eye-slash"} me-2`}></i>
            {thematic ? "Ver Normal" : "Ver Mapa Temático"}
          </button>
          <button onClick={handleRefresh} disabled={!selectedFile || loading} className="btn btn-success ms-2">
            <i className="bi bi-arrow-clockwise me-2"></i> Actualizar
          </button>
          <button onClick={exportToExcel} className="btn btn-warning ms-2">
            <i className="bi bi-file-earmark-excel me-2"></i> Exportar a Excel
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-info ms-2">
            <i className={`bi ${showFilters ? "bi-chevron-up" : "bi-chevron-down"} me-2`}></i>
            {showFilters ? "Ocultar Filtros" : "Mostrar Filtros"}
          </button>
        </div>
      </div>

      {showFilters && (
        <>
          <div className="row mt-3">
            <div className="col-md-3">
              <input
                type="text"
                placeholder="Filtrar por cod_ser"
                value={codSerFilter}
                onChange={(e) => setCodSerFilter(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="col-md-3">
              <input
                type="text"
                placeholder="Filtrar por barrio"
                value={barrioFilter}
                onChange={(e) => setBarrioFilter(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="col-md-3">
              <input
                type="text"
                placeholder="Filtrar por calle"
                value={calleFilter}
                onChange={(e) => setCalleFilter(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="col-md-3">
              <input
                type="text"
                placeholder="Filtrar por unidad"
                value={unidadFilter}
                onChange={(e) => setUnidadFilter(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <div className="row mt-3">
            <div className="col-md-12">
              <label className="form-label">Buscar por Deuda</label>
            </div>
            <div className="col-md-3">
              <input
                type="number"
                placeholder="Saldo mínimo"
                value={saldoFilter.min}
                onChange={(e) => setSaldoFilter({ ...saldoFilter, min: parseFloat(e.target.value) || 100.00 })}
                className="form-control"
                step="0.01"
                min="100.00"
                max="1000000.00"
              />
            </div>
            <div className="col-md-3">
              <input
                type="number"
                placeholder="Saldo máximo"
                value={saldoFilter.max}
                onChange={(e) => setSaldoFilter({ ...saldoFilter, max: parseFloat(e.target.value) || 1000000.00 })}
                className="form-control"
                step="0.01"
                min="100.00"
                max="1000000.00"
              />
            </div>
          </div>
        </>
      )}

      <div className="row mt-3">
        <div className="col-md-8">
          <MapContainer
            center={[-29.442260, -66.870089]}
            zoom={14}
            style={{ height: "600px", width: "100%" }}
            ref={mapRef}
          >
            <LayersControl position="topright">
              <BaseLayer checked name="Mapa Base">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </BaseLayer>
              <BaseLayer name="Imagen Satelital">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </BaseLayer>
              {layers.map((layer) => (
                <Overlay key={layer.id} checked name={layer.name}>
                  <MemoizedGeoJSON
                    data={{
                      ...layer.data,
                      features: getFilteredFeatures(),
                    }}
                    selectedFeatureIds={selectedFeatureIds}
                    handleFeatureClick={handleFeatureClick}
                    thematic={thematic}
                  />
                </Overlay>
              ))}
            </LayersControl>
            {thematic && showLegend && <Legend onClose={() => setShowLegend(false)} />}
          </MapContainer>
        </div>
        {window.innerWidth > 768 && (
          <div className="col-md-4">
            {popupData && (
              <div className="alert alert-info position-relative">
                <h5>Datos de la Parcela</h5>
                <button
                  onClick={() => setPopupData(null)}
                  className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2"
                >
                  <i className="bi bi-x"></i>
                </button>
                {Object.entries(popupData).map(([key, value]) => (
                  <p key={key}><b>{key}:</b> {value}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MapApp;