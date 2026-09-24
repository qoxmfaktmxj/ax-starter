export function parseGridClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (
      afterQuote &&
      character !== "\t" &&
      character !== "\r" &&
      character !== "\n"
    ) {
      throw new Error("닫힌 따옴표 뒤에 잘못된 문자가 있습니다.");
    }

    if (character === '"' && cell.length === 0 && !afterQuote) {
      quoted = true;
    } else if (character === "\t") {
      row.push(cell);
      cell = "";
      afterQuote = false;
    } else if (character === "\r" || character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      afterQuote = false;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("복사한 값의 따옴표가 닫히지 않았습니다.");
  if (text.length > 0 && text.at(-1) !== "\n" && text.at(-1) !== "\r") {
    row.push(cell);
    rows.push(row);
  } else if (row.length > 0 || cell.length > 0 || afterQuote) {
    row.push(cell);
    rows.push(row);
  } else if (text.length === 0) {
    return [[""]];
  }

  const width = rows[0]?.length ?? 0;
  if (rows.some((current) => current.length !== width)) {
    throw new Error("복사한 데이터의 열 수가 일정하지 않습니다.");
  }
  return rows;
}

export function serializeGridClipboard(rows: string[][]): string {
  if (rows.length === 0) return "";
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) {
    throw new Error("복사한 데이터의 열 수가 일정하지 않습니다.");
  }

  return rows
    .map((row) =>
      row
        .map((cell) =>
          /[\t\r\n"]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell,
        )
        .join("\t"),
    )
    .join("\r\n");
}
