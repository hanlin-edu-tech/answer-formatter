(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

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
const stringFormUtils = require('string-form-utils');


const toStringFormatter = function (answer) {
	return answer.toString();
};

const latexFormatter = function (answer) {
	return answer
		.replace(/\\ /g, '')
		.replace(/\{ *\}/g, '')
		.replace(/[\u2080-\u2089]/g, function (target) {
			const code = target.charCodeAt(0);
			return '_' + String.fromCharCode(code - 8272);
		});
};

const toLowerCaseFormatter = function (answer) {
	return answer.toLowerCase();
};

const fullwidthFormatter = function (answer) {
	return stringFormUtils.transformToHalfwidth(answer);
};

const removeSpaceFormatter = function (answer) {
	return answer.replace(/[\u0000-\u0020\u007F\s]/g, '');
};

const removeTailPeriodFormatter = function (answer) {
	return answer.replace(/^(.+)。$/, '$1');
};

const numberFormatter = function (answer) {
	return answer.replace(/(\d?)[,，‚](\d?)/g, "$1$2");
};

const phoneticFormatter = function (answer) {
	let result = answer
		.replace(/ㄧ/g, '一')
		.replace(/ㄚ/g, '丫')
		.replace(/•/g, '˙');
	//try {

	//  // IOS 15 不支援此語法
	//  result = result
	// 	.replace(/(?<!˙[ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫][ㄅ-ㄩ一丫])ˉ/g, "");
	//} catch(e) {
	result = result.replace(/ˉ/g, (match, offset, wholeStr) => {
		const before = wholeStr.slice(Math.max(0, offset - 4), offset);

		if (/˙[ㄅ-ㄩ一丫]{1,3}$/.test(before)) {
			return 'ˉ'; // 不刪
		}
		return ''; // 刪
	});
	//}
	return result;
};

const synonymsFormatter = function (answer) {
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

const symbolFormatter = function (answer) {
	return answer
		.replace(/,|，/g, "‚")
		.replace(/’/g, "'")
		.replace(/＝/g, "=")
		.replace(/《|》/g, "");
};

const booleanFormatter = function (answer) {
	switch (answer) {
		case "◯":
		case "○":
		case "O":
		case "o":
		// case "0":
		case "ˇ":
		case "true":
			return "true"
		case "╳":
		// case "X":
		// case "x":
		case "✕":
		case "false":
			return "false"
		default:
			return answer
	}
};

const formatters = [
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


const format = function (answer) {
	let result = answer;
	for (let i = 0; i < formatters.length; i++) {
		result = formatters[i](result);
	}
	return result;
};

const equals = function (answer1, answer2) {
	return format(answer1) == format(answer2)
};

const answerFormatter = {
	format,
	equals
};


if (typeof module !== "undefined" && module !== null) {
	module.exports = answerFormatter;
}

if (typeof window !== "undefined" && window !== null) {
	window.answerFormatter = answerFormatter;
}

},{"string-form-utils":1}]},{},[2]);
