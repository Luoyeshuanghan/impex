/**
 * 扫描器
 */

var Scanner = new function() {
	//预扫描
	function prescan(node){
		var textNodeAry = [];
		var replacements = [];
		queryAllTextNode(node,textNodeAry);

		for(var ii=textNodeAry.length;ii--;){
			var node = textNodeAry[ii];
			var text = node.nodeValue;
			var segments = [];
			var lastPos = 0;
			text.replace(REG_EXP,function(fullTxt,modelExp,pos){				
				segments.push(text.substring(lastPos,pos));
				segments.push(fullTxt);

				lastPos = pos + fullTxt.length;
			});

			segments.push(text.substring(lastPos,text.length));

			var fragment = document.createDocumentFragment();
			for(var i=0;i<segments.length;i++){
				var tn = document.createTextNode(segments[i]);
				fragment.appendChild(tn);
			}
			replacements.unshift(fragment);
		}
		

		for(var i=textNodeAry.length;i--;){
			var n = textNodeAry[i];
			if(replacements[i].childNodes.length>1)
				n.parentNode.replaceChild(replacements[i],n);
		}
	}
	function queryAllTextNode(node,textAry){
		if(node.tagName == 'SCRIPT')return;
		if(node.attributes || node.nodeType == 11){
			if(node.childNodes.length>0){
				for(var i=0,l=node.childNodes.length;i<l;i++){
					queryAllTextNode(node.childNodes[i],textAry);
				}
			}
		}else
		if(node.nodeType === 3){
			if(node.nodeValue.replace(/\t|\r|\s/img,'').length<1)return;
			textAry.push(node);
		}
	}

	/**
	 * 扫描DOM节点
	 */
	this.scan = function(view,component){
		var node = view.element;
		prescan(node);
		scan(node,component);
	}

	//扫描算法
	//1. 如果发现是组件,记录，中断
	//2. 如果发现是指令，记录，查看是否final，如果是，中断
	//3. 如果发现是表达式，记录
	function scan(node,component){
		if(node.tagName == 'SCRIPT')return;

		if(node.attributes || node.nodeType == 11){
			if(node.tagName){
				var tagName = node.tagName.toLowerCase();
				//组件
				if(ComponentFactory.hasTypeOf(tagName)){
					component.createSubComponentOf(tagName,node);
					return;
				}

				var atts = node.attributes;
				var subScope;
				//检测是否有子域属性，比如each
				for(var i=atts.length;i--;){
					var c = atts[i].name.replace(CMD_PREFIX,'');
					if(DirectiveFactory.hasTypeOf(c) && DirectiveFactory.isFinal(c)){
						var instance = DirectiveFactory.newInstanceOf(c,node,component,atts[i].name,atts[i].value);
						component.$__directives.push(instance);
						return;
					}
				}
				for(var i=atts.length;i--;){
					var att = atts[i];
					var attName = att.name;
					var attVal = att.value;
					if(REG_CMD.test(attName)){
						var c = attName.replace(CMD_PREFIX,'');
						//如果有对应的处理器
						if(DirectiveFactory.hasTypeOf(c)){
							var instance = DirectiveFactory.newInstanceOf(c,node,component,atts[i].name,attVal);
							component.$__directives.push(instance);
						}
					}else if(REG_EXP.test(attVal)){//只对value检测是否表达式，name不检测
				    	recordExpNode(attVal,node,component,attName);
					}
				}
			}

	    	if(node.childNodes.length>0){
				for(var i=0,l=node.childNodes.length;i<l;i++){
					scan(node.childNodes[i],component);
				}
			}
		}else if(node.nodeType == 3){
			if(node.nodeValue.replace(/\t|\r|\s/img,'').length<1)return;
			//文本节点处理
			recordExpNode(node.nodeValue,node,component);
		}
	}

	//表达式解析
	function recordExpNode(origin,node,component,attrName){
		//origin可能包括非表达式，所以需要记录原始value
		var exps = {};
		var converters = {};
		origin.replace(REG_EXP,function(a,modelExp){
			var i = 1;
			if(CONVERTER_EXP.test(modelExp)){
				i = parseConverters(modelExp,converters,component);
			}
			var expStr = modelExp;
			if(i > 1)
				expStr = modelExp.substr(i);
    		var tmp = lexer(expStr);
    		
    		//保存表达式
    		exps[modelExp] = {
    			words:tmp.words,
    			varTree:tmp.varTree
    		};
    	});
		if(Object.keys(exps).length<1)return;

		var expNode = new ExpNode(node,attrName,origin,exps,component,converters);
		component.$__expNodes.push(expNode);
	}

	function parseConverters(expStr,converters,component){
		var inName = true,
			inParam,
			unknown;
		var currName = '',
			currParam = '',
			currParams = [];
		for(var i=expStr.indexOf(EXP_CONVERTER_SYM)+1;i<expStr.length;i++){
			var l = expStr[i];
			switch(l){
				case ' ':case '\t':
					unknown = true;
					continue;
				case ':':
					inParam = true;
					inName = false;
					unknown = false;
					if(currParam){
						currParams.push(currParam);
						currParam = '';
					}
					continue;
				case '|':
					inParam = false;
					inName = true;
					unknown = false;
					if(currName && ConverterFactory.hasTypeOf(currName)){
						converters[currName] = [ConverterFactory.newInstanceOf(currName,component),currParams];
					}
					if(currParam){
							currParams.push(currParam);
						}
					currName = '';
					currParam = '';
					currParams = [];
					continue;
				default:
					if(unknown){
						if(currName){
							converters[currName] = [ConverterFactory.newInstanceOf(currName,component),currParams];
						}
						if(currParam){
							currParams.push(currParam);
						}
						return i;
					}
			}

			if(inName)currName += l;
			else if(inParam){
				currParam += l;
			}
		}

		return i;
	}
}