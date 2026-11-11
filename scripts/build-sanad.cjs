const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const check=process.argv.includes('--check');
const pages=[
 ['sanad-preview.html','index.html',[['./sanad-admin-preview.html','./admin.html']]],
 ['sanad-admin-preview.html','admin.html',[['./sanad-preview.html','./index.html']]]
];
const outputs=new Map();
for(const [source,target,replacements] of pages){
 let content=fs.readFileSync(source,'utf8');
 for(const [from,to]of replacements)content=content.replaceAll(from,to);
 outputs.set(target,content);
}
for(const file of ['sanad-demo.js','sanad-admin-demo.js'])outputs.set(file,fs.readFileSync(file,'utf8'));
for(const [file,content]of outputs){
 assert.ok(!/\.\.\/|msb_|catalog\.js|seller\.html|maison/i.test(content),'Sanad must not depend on storefront: '+file);
 const destination=path.join('sanad',file);
 if(check)assert.equal(fs.readFileSync(destination,'utf8'),content,'Regenerate standalone Sanad files: '+destination);
 else{fs.mkdirSync('sanad',{recursive:true});fs.writeFileSync(destination,content)}
}
console.log(check?'PASS standalone Sanad source parity and storefront isolation':'Built standalone Sanad directory');
