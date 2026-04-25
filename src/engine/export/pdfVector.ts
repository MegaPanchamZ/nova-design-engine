import { jsPDF } from 'jspdf';

export interface PdfVectorPath {
  d: string;
  stroke?: string;
  fill?: string;
}

export interface PdfVectorDocumentInput {
  width: number;
  height: number;
  paths: PdfVectorPath[];
}

const parseSimplePath = (path: string): number[] => {
  return path
    .replace(/[A-Za-z]/g, ' ')
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
};

export const generateVectorPdf = (input: PdfVectorDocumentInput): jsPDF => {
  const doc = new jsPDF({
    orientation: input.width >= input.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [input.width, input.height],
  });

  input.paths.forEach((path) => {
    const values = parseSimplePath(path.d);
    if (values.length < 4) return;

    for (let i = 0; i + 3 < values.length; i += 2) {
      const x1 = values[i];
      const y1 = values[i + 1];
      const x2 = values[i + 2];
      const y2 = values[i + 3];
      doc.line(x1, y1, x2, y2);
    }
  });

  return doc;
};
