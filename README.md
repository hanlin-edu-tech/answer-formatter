##deploy##

cp src/answer-formatter.js lib/answer-formatter.js
browserify src/answer-formatter.js -o lib/answer-formatter-all.js
minify lib/answer-formatter-all.js -o lib/answer-formatter-all.min.js
minify lib/answer-formatter.js -o lib/answer-formatter.min.js

npm publish