const fs = require('fs');
const path = require('path');

const files = [
    'CONFIGURAR-INICIAL.bat',
    'INICIAR-MECANET.bat',
    'sistema/iniciar-servidor.bat'
];

files.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath);

        // Remove BOM if present
        if (content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
            console.log(`Removing BOM from ${file}`);
            content = content.subarray(3);
        }

        // Ensure CRLF
        let text = content.toString('utf8');
        // Replace LF with CRLF (but avoid double CR)
        text = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

        fs.writeFileSync(filePath, text, { encoding: 'utf8' }); // writeFileSync usually doesn't add BOM by default in Node
        console.log(`Fixed ${file}`);
    } else {
        console.log(`File not found: ${file}`);
    }
});
