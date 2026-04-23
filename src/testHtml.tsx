import React from 'react';
import html2pdf from 'html2pdf.js';

export default function Test() {

  const downloadPDF = () => {
    const element = document.getElementById('report');

    html2pdf().set({
      margin: 10,
      filename: 'report.pdf',
      html2canvas: {
        scale: 2,
        useCORS: true
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      },
      pagebreak: {
        mode: ['css', 'legacy'] // 🔥 핵심
      }
    }).from(element).save();
  };

  return (
    <div style={{ padding: '20px' }}>

      <div id="report">

        {/* ✅ 섹션 1 */}
        <div className="pdf-section">
          <h3>관련 사고사례</h3>
          <p>{Array(80).fill('전기 감전 사고 사례 내용 ').join('')}</p>
        </div>

        {/* ✅ 섹션 2 */}
        <div className="pdf-section">
          <h3>최근 중대재해 동향</h3>
          <p>{Array(120).fill('최근 산업 동향 내용 ').join('')}</p>
        </div>

        {/* ✅ 섹션 3 */}
        <div className="pdf-section">
          <h3>현장 맞춤 핵심 안전수칙</h3>
          <p>{Array(80).fill('안전수칙 내용 ').join('')}</p>
        </div>

      </div>

      <button onClick={downloadPDF}>
        PDF 다운로드
      </button>
    </div>
  );
}