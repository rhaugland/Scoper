import puppeteer from "puppeteer";
import { marked } from "marked";

function buildHTML(markdown: string, projectName: string, clientName: string | null, date: string): string {
  const bodyHtml = marked.parse(markdown) as string;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 60px 50px; size: letter; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 100%;
  }
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    text-align: center;
    page-break-after: always;
  }
  .cover h1 {
    font-size: 28pt;
    color: #2d5016;
    margin-bottom: 8px;
    font-weight: 700;
  }
  .cover .client {
    font-size: 16pt;
    color: #666;
    margin-bottom: 40px;
  }
  .cover .date {
    font-size: 11pt;
    color: #999;
  }
  .cover .company {
    font-size: 12pt;
    color: #2d5016;
    margin-top: 60px;
    font-weight: 600;
  }
  h2 {
    font-size: 16pt;
    color: #2d5016;
    border-bottom: 2px solid #2d501620;
    padding-bottom: 6px;
    margin-top: 30px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 13pt;
    color: #333;
    margin-top: 20px;
  }
  p { margin: 8px 0; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
  }
  th {
    background: #2d501610;
    color: #2d5016;
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
  }
  tr:nth-child(even) td { background: #fafaf8; }
  strong { color: #2d5016; }
</style>
</head>
<body>
  <div class="cover">
    <h1>${projectName}</h1>
    ${clientName ? `<div class="client">Prepared for ${clientName}</div>` : ""}
    <div class="date">${date}</div>
    <div class="company">w3</div>
  </div>
  ${bodyHtml}
</body>
</html>`;
}

export async function renderProposalPDF(
  markdown: string,
  projectName: string,
  clientName: string | null
): Promise<Buffer> {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = buildHTML(markdown, projectName, clientName, date);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "60px", bottom: "60px", left: "50px", right: "50px" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
