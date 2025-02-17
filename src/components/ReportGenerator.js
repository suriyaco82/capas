import React, { useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const ReportGenerator = ({ mapContainerId, fileName = "reporte.pdf" }) => {
  const mapRef = useRef(null);

  const generatePDF = async () => {
    const mapElement = document.getElementById(mapContainerId);

    if (!mapElement) {
      console.error("No se encontró el contenedor del mapa.");
      return;
    }

    try {
      // Capturar el contenido del mapa como una imagen
      const canvas = await html2canvas(mapElement, {
        useCORS: true, // Permitir imágenes de origen cruzado
        scale: 2, // Aumentar la resolución de la imagen
      });

      // Crear un PDF
      const pdf = new jsPDF("landscape", "mm", "a4");
      const imgData = canvas.toDataURL("image/png");

      // Añadir la imagen al PDF
      const imgWidth = 297; // Ancho de A4 en mm (landscape)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      // Guardar el PDF
      pdf.save(fileName);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
    }
  };

  return (
    <button onClick={generatePDF} className="btn btn-danger">
      <i className="bi bi-file-earmark-pdf me-2"></i> Generar Reporte PDF
    </button>
  );
};

export default ReportGenerator;