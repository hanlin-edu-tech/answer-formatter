var toStringFormatter = function(answer){
	return answer.toString();
};

var toLowerCaseFormatter = function(answer){
	return answer.toLowerCase();
};

var stringFormUtils = require('string-form-utils');
var fullwidthFormatter = function(answer){
	return stringFormUtils.transformToHalfwidth(answer);
};

var removeSpaceFormatter = function(answer){
	return answer.replace(/[\u0000-\u0020\u007F\s]/g, '');
};

var removeTailPeriodFormatter = function(answer){
	return answer.replace(/^(.+)。$/, '$1');
};

var numberFormatter = function(answer){
	return answer.replace(/(\d?)[,，‚](\d?)/g, "$1$2");
};

var phoneticFormatter = function(answer){
	return answer
		.replace(/ㄧ/g, '一')
		.replace(/ㄚ/g, '丫')
		.replace(/•/g, '˙')
		.replace(/(?<!˙[ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫][ㄅ-ㄩ一丫])ˉ/g, "");
};

var synonymsFormatter = function(answer){
	return answer
		.replace(/關聯/g, '關連')
		.replace(/花崗/g, '花岡')
		.replace(/台江/g, '臺江')
		.replace(/台灣/g, '臺灣')
		.replace(/台北/g, '臺北')
		.replace(/台東/g, '臺東')
		.replace(/台西/g, '臺西')
		.replace(/台南/g, '臺南')
		.replace(/台中/g, '臺中')
		.replace(/西台/g, '西臺')
		.replace(/中正國際機場|中正機場|桃園機場/g, '桃園國際機場')
		.replace(/臺灣桃園國際機場/g, '桃園國際機場')
		.replace(/渡台禁令/g, '渡臺禁令')
		.replace(/劃/g, '畫')
		.replace(/窰|窑/g, '窯')
		.replace(/姊/g, '姐')
		.replace(/啓/g, '啟')
		.replace(/荐/g, '薦')
		.replace(/簔/g, '簑')
		.replace(/污/g, '汙')
		.replace(/砂/g, '沙');
};

var symbolFormatter = function(answer){
	return answer
		.replace(/,|，/g, "‚")
		.replace(/’/g, "'")
		.replace(/＝/g, "=")
		.replace(/《|》/g, "");
};

var booleanFormatter = function(answer){
	switch(answer){
		case "◯":
		case "○":
		case "O":
		case "o":
		case "0":
		case "ˇ":
		case "true":
			return "true"
		case "╳":
		case "X":
		case "x":
		case "false":
			return "false"
		default:
			return answer
	}
};

var latexFormatter = function(answer) {
 
    return answer
        .replace(/\\ /g, '') 
        .replace(/[^]\{ *\}/g, '')
		.replace(/[\u2080-\u2089]/g, function(target){
			var code = target.charCodeAt(0);
			return '_' + String.fromCharCode(code - 8272);
		});
};

var formatters = [
	toStringFormatter,
	latexFormatter,
	toLowerCaseFormatter,
	fullwidthFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	numberFormatter,
	phoneticFormatter,
	synonymsFormatter,
	symbolFormatter,
	booleanFormatter
];


var format = function (answer){
	var result = answer;
	for(var i=0 ; i<formatters.length ; i++){
		result = formatters[i](result);
	}
	return result;
};

var equals = function (answer1, answer2){
	return  format(answer1) == format(answer2)
};

var answerFormatter = {
	format : format,
	equals : equals
};


if (typeof module !== "undefined" && module !== null) {
  module.exports = answerFormatter;
}

if (typeof window !== "undefined" && window !== null) {
  window.answerFormatter = answerFormatter;
}
