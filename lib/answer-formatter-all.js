(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

(function(){

  var _FULL_WIDTH_DIFF_CODE = 65248;
  var _FULL_WIDTH_SPACE_CODE = 12288;
  var _HALF_WIDTH_SPACE_CODE = 32;
  var _RANGE_CODES = {
    MIN:33,
    MAX:126
  };

  /**
   * @private
   * @param {String} strs
   * @type function
   */
  var _forEachByString = function( strs, func ){
    var len = strs.length, result = [];

    for ( var i = 0 ; i < len ; i++ ) {
      result.push(func(strs[i], strs[i].charCodeAt(0)));
    }
    return result.join('');
  };

  /**
   * @namespace
   */
  var stringFormUtils = {

    /**
     * @param {String} val
     * @type String
     */
    transformToFullwidth:function( val ){

      return _forEachByString(val, function( str, code ){

        var result = str;

        if ( _HALF_WIDTH_SPACE_CODE == code ) result = String.fromCharCode( _FULL_WIDTH_SPACE_CODE );

        else if ( (_RANGE_CODES.MIN <= code) && (code <= _RANGE_CODES.MAX) ) result = String.fromCharCode( code + _FULL_WIDTH_DIFF_CODE );

        return result;

      });
    },

    /**
     * @param {String} val
     * @type String
     */
    transformToHalfwidth:function( val ){

      return _forEachByString(val, function( str, code ){

        var result = str;
        
        if ( _FULL_WIDTH_SPACE_CODE == code ) result = String.fromCharCode( _HALF_WIDTH_SPACE_CODE );

        else if ( ((_RANGE_CODES.MIN + _FULL_WIDTH_DIFF_CODE) <= code) && (code <= (_RANGE_CODES.MAX + _FULL_WIDTH_DIFF_CODE)) ) result = String.fromCharCode( code - _FULL_WIDTH_DIFF_CODE );

        return result;

      });
    }
  };

  if ( typeof module !== "undefined" ) module.exports = stringFormUtils;

  else if ( typeof window === "object" ) window.stringFormUtils = stringFormUtils;

})();


},{}],2:[function(require,module,exports){
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
		.replace(/劃/g, '畫')
		.replace(/窰|窑/g, '窯');
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
},{"string-form-utils":1}]},{},[2]);
