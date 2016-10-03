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
		.replace(/ㄚ/g, '丫');
};

var formatters = [
	toStringFormatter,
	toLowerCaseFormatter,
	fullwidthFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	numberFormatter,
	phoneticFormatter
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