import { describe, it, expect } from 'vitest';
import { csvCell, escapeHtml, writePrintDocument } from '../../utils/safeDocuments';

describe('document safety', () => {
  it('escapes stored markup before inserting it into a receipt', () => {
    expect(escapeHtml('<style>body{display:none}</style>')).toBe('&lt;style&gt;body{display:none}&lt;/style&gt;');
  });
  it('removes executable content and disconnects the opener', () => {
    let printed = '';
    const target = { opener: {}, document: { write: html => { printed = html; } } };
    writePrintDocument(target, '<html><body><script>alert(1)</script><img src="x" onerror="alert(1)"><p>Receipt</p></body></html>');
    expect(printed).not.toMatch(/<script|onerror/i);
    expect(printed).toContain('Receipt');
    expect(target.opener).toBeNull();
  });
  it('quotes CSV and prevents formulas', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
