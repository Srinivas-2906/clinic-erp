import PDFDocument from 'pdfkit';

export function buildPrescriptionPdfBuffer({ clinicName, patient, doctor, encounter, items }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(clinicName || 'Clinic', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text('Prescription', { align: 'center' });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Patient: ${patient?.name || '—'}`);
    if (patient?.age) doc.text(`Age: ${patient.age}`);
    if (patient?.phone) doc.text(`Phone: ${patient.phone}`);
    doc.text(`Date: ${new Date(encounter?.finalizedAt || Date.now()).toLocaleDateString('en-IN')}`);
    doc.moveDown();

    doc.text(`Doctor: ${doctor?.displayName || doctor?.name || '—'}`);
    if (doctor?.registrationNumber) doc.text(`Reg. No: ${doctor.registrationNumber}`);
    doc.moveDown();

    if (encounter?.chiefComplaint) {
      doc.text(`Chief complaint: ${encounter.chiefComplaint}`);
      doc.moveDown(0.5);
    }
    if (encounter?.diagnoses?.length) {
      doc.text(`Diagnosis: ${encounter.diagnoses.map((d) => d.description).join('; ')}`);
      doc.moveDown();
    }

    doc.fontSize(11).text('Rx', { underline: true });
    doc.moveDown(0.3);
    items.forEach((item, i) => {
      const line = `${i + 1}. ${item.drugName}`;
      doc.fontSize(10).text(line, { continued: false });
      const sub = [item.dose, item.frequency, item.duration].filter(Boolean).join(' · ');
      if (sub) doc.text(`   ${sub}`, { indent: 12 });
      if (item.instructions) doc.text(`   ${item.instructions}`, { indent: 12 });
      doc.moveDown(0.3);
    });

    if (encounter?.clinicalNote) {
      doc.moveDown();
      doc.fontSize(10).text(`Notes: ${encounter.clinicalNote}`);
    }

    doc.moveDown(2);
    doc.text('— End of prescription —', { align: 'center' });
    doc.end();
  });
}
