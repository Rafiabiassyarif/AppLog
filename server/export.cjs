'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const COLUMNS = ['No.', 'Nama aplikasi', 'Jenis', 'Status', 'Pembuat', 'Tahun', 'Teknologi', 'Link', 'Deskripsi'];
const typeLabel = app => (app.type === 'internal' ? 'Internal Kroombox' : 'Personal');
const rowValues = (app, index) => [index + 1, app.name, typeLabel(app), app.status, app.owner, app.year, app.tech, app.link, app.description];
const today = () => new Date().toLocaleDateString('id-ID');

async function writeXlsx(res, rows) {
  const book = new ExcelJS.Workbook();
  book.creator = 'AppLog';
  const sheet = book.addWorksheet('Daftar Aplikasi', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [6, 30, 22, 19, 24, 10, 32, 42, 60].map(width => ({ width }));

  sheet.mergeCells('A1:I1');
  const title = sheet.getCell('A1');
  title.value = 'APPLOG • DAFTAR APLIKASI';
  title.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF143D32' } };
  sheet.getRow(1).height = 42;

  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = `Diekspor ${today()} · ${rows.length} aplikasi`;
  sheet.getRow(2).height = 26;

  const header = sheet.getRow(4);
  header.values = COLUMNS;
  header.height = 30;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FF143D32' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EF85' } };
  });

  rows.forEach((app, index) => {
    const row = sheet.addRow(rowValues(app, index));
    row.height = Math.max(60, Math.min(180, Math.ceil(app.description.length / 55) * 15 + 15));
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { size: 11, color: { argb: 'FF263B2E' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? 'FFF1F5EC' : 'FFFFFFFF' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    });
  });

  sheet.autoFilter = 'A4:I4';
  sheet.pageSetup.printTitlesRow = '1:4';
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="applog-apps.xlsx"',
    'Cache-Control': 'no-store',
  });
  await book.xlsx.write(res);
  res.end();
}

function writePdf(res, rows) {
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="applog-apps.pdf"',
    'Cache-Control': 'no-store',
  });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.pipe(res);

  const header = () => {
    doc.fillColor('#143d32').fontSize(21).text('APPLOG / Daftar Aplikasi', 36, 36);
    doc.fontSize(10).fillColor('#666666').text(`Diekspor ${today()} | ${rows.length} aplikasi`, 36, 65);
  };
  header();
  let y = 100;

  rows.forEach((app, index) => {
    const parts = [
      { text: `${index + 1}. ${app.name}`, size: 13, color: '#143d32', gap: 7 },
      { text: `${app.type === 'internal' ? 'Internal' : 'Personal'}  |  ${app.status}  |  ${app.owner}  |  ${app.year || '-'}`, size: 9, color: '#6a7866', gap: 5 },
      { text: `Teknologi: ${app.tech || '-'}`, size: 9, color: '#6a7866', gap: 5 },
      { text: `Link: ${app.link || '-'}`, size: 9, color: '#6a7866', gap: 7 },
      { text: app.description || '-', size: 10, color: '#3d4c36', gap: 0 },
    ];
    let height = 24;
    for (const part of parts) {
      doc.fontSize(part.size);
      part.height = doc.heightOfString(part.text, { width: 740 });
      height += part.height + part.gap;
    }
    if (y + height > 550) {
      doc.addPage();
      header();
      y = 100;
    }
    doc.rect(36, y, 770, height).fill(index % 2 ? '#f0f5e9' : '#f7f9f5');
    let lineY = y + 12;
    for (const part of parts) {
      doc.fontSize(part.size).fillColor(part.color).text(part.text, 48, lineY, { width: 740 });
      lineY += part.height + part.gap;
    }
    y += height + 10;
  });

  if (!rows.length) doc.fontSize(12).fillColor('#3d4c36').text('Belum ada aplikasi sesuai filter.', 36, 100);
  doc.end();
}

module.exports = { writeXlsx, writePdf };
