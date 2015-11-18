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
}

var stringFormUtils = require('string-form-utils');
var fullwidthFormatter = function(answer){
	return stringFormUtils.transformToHalfwidth(answer);
};

var removeSpaceFormatter = function(answer){
	return answer.replace(/\s/g, '');
};

var numberFormatter = function(answer){
	var numberRegx = /^[\d,\.]+$/
	if(numberRegx.test(answer)){
		return answer.replace(/,/g, '');
	}
	return answer;
};

var formatters = [
	toStringFormatter,
	fullwidthFormatter,
	removeSpaceFormatter,
	numberFormatter
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
