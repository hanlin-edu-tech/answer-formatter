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
	return answer.replace(/\s/g, '');
};

var removeTailPeriodFormatter = function(answer){
	return answer.replace(/^(.+)。$/, '$1');
};

var numberFormatter = function(answer){
	return answer.replace(/(\d?),(\d?)/g, "$1$2");
};

var phoneticFormatter = function(answer){
	return answer
		.replace(/ㄧ/g, '一')
		.replace(/ㄚ/g, '丫')
		.replace(/•/g, '˙');
};

var synonymsFormatter = function(answer){
	return answer
		.replace(/台灣/g, '臺灣')
		.replace(/台北/g, '臺北')
		.replace(/台東/g, '臺東')
		.replace(/台西/g, '臺西')
		.replace(/台南/g, '臺南')
		.replace(/台中/g, '臺中')
		.replace(/西台/g, '西臺')
		.replace(/中正國際機場|中正機場|桃園機場/g, '桃園國際機場')
		.replace(/臺灣桃園國際機場/g, '桃園國際機場')
		.replace(/劃/g, '畫');
};

var formatters = [
	toStringFormatter,
	toLowerCaseFormatter,
	fullwidthFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	numberFormatter,
	phoneticFormatter,
	synonymsFormatter
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