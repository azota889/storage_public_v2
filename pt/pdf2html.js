String.prototype.replaceAll = function(find, replace) {
    var str = this;
    return str.replace(new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replace);
};
class pdf2html{
    FENCE_CHAR="(){}[]|";
    SPECIAL_CHAR="-¯−=+(){}[]|><·⇐⇒∫";

    _callback=null;
    _pdfLink=null;
    _processState=0; // 0 not process , 1 processing 

    _documentPdf=null;
    _scale=1;

    _graphic=null; // all information page get 
    _pageNumber=0;
    _pageTotal=0;
    _page=null;
    _pageHtml="";
    _pageRender=null;
    _pagePosy=0;
    _pageLines=null;
    _pageLinePath=null;
    _pageShapes=null;
    _currLine=null;
    _pageLineMaxHeight=0;
    _pageNodeCount=0;
    
    //_fontUnitWidth=null;
    
    _deltaOverlap=3;
    _deltaFontStep=2;
    constructor(){  
        this._init();
        this.log("pdf2html version "+this.version);
    }

    get version(){
        return "1.0";
    }

    _init(){
        this._render=document.createElement("div");
        this._render.style.position="absolute";
        this._render.style.top="0px";
        this._render.style.left="0px";
        this._render.style.display="block";
        this._render.style.opacity="1";
        document.body.appendChild(this._render);

        this._renderOutput=document.createElement("div");
        this._renderOutput.style.position="absolute";
        this._renderOutput.style.top="0px";
        this._renderOutput.style.left="0px";
        this._renderOutput.style.display="block";
        this._renderOutput.style.transformOrigin="0% 0%";
        this._renderOutput.style.transform="scale(2)";
        this._renderOutput.style.width=((window.innerWidth/1.5)-2)+"px";
        this._renderOutput.style.height='100%';
        this._renderOutput.style.overflow="scroll";
        document.body.appendChild(this._renderOutput);

    }
    /**
     * 
     * @param {*} str 
     */
     log(...args){
        var timestamp=new Date().toISOString();
        var strlog=timestamp.substr(timestamp.length-13,13);
        args.splice(0,0,strlog);
        console.log(...args);
    }

    /**
     * 
     * @param {String} pdfLink link pdf to process 
     * @param {Function} callback callback when convert page done onPage(pageHtml,pageNumber,pageTotal)
     */
    process(pdfLink,callback){
        if(!pdfLink || !(typeof pdfLink =="string")) return;
        if(this._processState==1) return ; // current processing 
        this._reset();

        this._pdfLink=pdfLink;
        this._callback=callback;
        this._processState=1;
        
        //start using pdfjs to render to svg
        const LoadFilePdf = pdfjsLib.getDocument({ url: this._pdfLink, fontExtraProperties: true, useSystemFonts: true });
        LoadFilePdf.promise.then((documentPdf) => {
            
            this.documentPdf = documentPdf;
            this._pageTotal=documentPdf.numPages;
            this._pageTotal=(this._pageTotal>31)? 31:this._pageTotal;
            this.log("get document !"+this._pageNumber+":"+this._pageTotal);
            //start process page
            this._processPage(1);
        }).catch(e=>{
            this.log("Error pdfjs load file "+this._pdfLink);
            this._reset();
        });


    }
    /**
     * reset all 
     */
    _reset(){
        this._callback=null;
        this._pdfLink=null;
        this._currPage=1;
        this._documentPdf=null;
        this._page=null;
        this._pageHtml="";
        this._pageOutput=[];
        this._processState=0;
        this._pagePosy=0;
        this._pageNumber=0;
        this._graphic=null;
        this._fontUnitWidth={};
        this._nodeIndex=0;
        this._wordIndex=0;
        this._lineIndex=0;
        this._fenceIndex=0;
        this._render.innerHTML="";
        this._renderOutput.innerHTML="";
    }

    _callbackPageOut(){
        var pageout=[];
        for(var i=0;i<this._pageOutput.length;i++){
            var page=this._pageOutput[i];
            var pageInfo={
                index:i,
                width:page.width,
                height:page.height,
                lines:[],
            }
            pageout.push(pageInfo);
            for(var j=0;j<page.lines.length;j++){
                var line=page.lines[j];
                if(line.isMerge==true) continue;
                var lineInfo={
                    x:line.x,
                    y:line.y,
                    c:"",
                    width:line.width,
                    height:line.height,
                    words:[],
                }
                pageInfo.lines.push(lineInfo);
                var currPosx=0;
                for(var k=0;k<line.wordsMerge.length;k++){
                    var word=line.wordsMerge[k];
                    delete word.currLine;
                    delete word.originLine;
                    word.x=word.x;
                    word.y=word.y;
                    word.width=word.width;
                    word.height=word.height;
                    if(k==0 || currPosx+0.5>word.x){
                        lineInfo.c+=word.c;
                        currPosx=(currPosx<word.x+word.width)? word.x+word.width:currPosx;
                    }else{
                        lineInfo.c+=" "+word.c;
                        currPosx=word.x+word.width;
                    }
                    
                    lineInfo.words.push(word);
                }
            }
        }

        if(this._callback) this._callback(JSON.stringify(pageout));

        //this._reset();
    }

    /**
     * 
     * @param {Number} pageNumber 
     */
    _processPage(pageNumber){
        if(isNaN(pageNumber) || pageNumber<=0) {
            //strange things
            this._reset();
            return;
        };

        //process all done
        if(pageNumber>this._pageTotal){
            this.log("finish parse all page ");
            //this.log(this._pageOutput);
            this._callbackPageOut();
            return;
        }

        this._graphic=null;
        this._fontUnitWidth={};        

        //get page svg , canvas to parse 
        this._pageNumber=pageNumber;
        this.log("process page "+this._pageNumber);
        this.documentPdf.getPage(pageNumber).then((page) => {
            var viewport = page.getViewport({ scale: this._scale });
            this._page=page;
            this.log("start parse svgGfx ");
            page.getOperatorList().then((opList) => {
                var svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
                svgGfx.embedFonts = true;
                this.log("start parse svg ");
                this._page2svg(svgGfx,opList,viewport);     
            }).catch(e=>{
                this.log("Error page getOperatorList "+this._pageNumber+" "+e);
                this._processPage(this._pageNumber+1);
            });
        }).catch(e=>{
            this.log("Error parse page "+this._pageNumber+" "+e);
            this._processPage(this._pageNumber+1);
        })
    }
    /**
     * 
     * @param {*} svgGfx 
     * @param {*} opList 
     * @param {*} viewport 
     */
    _page2svg(svgGfx,opList,viewport){
        //render svg to process
        svgGfx.getSVG(opList, viewport).then( async (svg) => {   
            this._graphic={commonObjs:this._page.commonObjs.getAll(),objs:this._page.objs.getAll()};
           // console.log(this._graphic);

            this.log("start render div");
            this._pageRender=this._pageRenderSvg(svg);
            this._render.appendChild(this._pageRender.div);
            this._currPageOut={
                pageIndex:this._pageNumber,
                width:parseInt(this._pageRender.div.style.width),
                height:parseInt(this._pageRender.div.style.height),
                maxLineHeight:0,
                divElement:[],
                partialFences:[],
                lineFracs:[],
                lines:[],
                rotateNodes:[],
                startTime:new Date().getTime()
            }
            this._pageOutput.push(this._currPageOut);
            await this._startParsePage();
            this.log("finish parse page !!!");
            this._currPageOut.endTime=new Date().getTime();
            this._render.innerHTML="";
            this._pageRenderOutput(this._currPageOut);
            setTimeout(()=>{
                //if(this._pageNumber<this._pageTotal && this._pageNumber<31) this._processPage(this._pageNumber+1);
                this._processPage(this._pageNumber+1);
            },50);

            
            //this.log("start render canvas");
            /*this._canvasOnlyRenderSpecialChar=true;
            this._page.render({canvasContext: this._pageRender.cvRender.getContext("2d"), viewport: this._page.getViewport({ scale: this._scale })}).promise.then(async ()=>{
                this.log("finish render canvas");
                this._canvasOnlyRenderSpecialChar=false;
                
                
                //done
            //    if(this._callback) this._callback(this._pageHtml,this._pageNumber,this._pageTotal)
               // if(this._pageNumber<this._pageTotal && this._pageNumber<31) this._processPage(this._pageNumber+1);
            })/*.catch(e=>{
                this.log("Error page getSVG "+this._pageNumber+" "+e);
                this._processPage(this._pageNumber+1);   
            })*/
        })/*.catch(e=>{
            this.log("Error page getSVG "+this._pageNumber+" "+e);
            this._processPage(this._pageNumber+1);
        });*/
    }


   
    /**
     * 
     * @param {SVGHTMLElement} svg 
     */
    _pageRenderSvg(svg){

      var w=parseInt(svg.getAttribute("width"));
      var h=parseInt(svg.getAttribute("height"));

      var div=document.createElement("div");
      div.style.position="absolute";
      div.style.width=w+"px";
      div.style.height=h+"px";
      div.style.left="0px";
      div.style.top="0px";
     // div.style.top=this._pagePosy+"px";
     // this._pagePosy+=h;
     
      var divSvg=document.createElement("div");
      divSvg.style.position="absolute";
      divSvg.style.height=h+"px";
      divSvg.style.width=w+"px";
      divSvg.style.top="0px";
      divSvg.style.left="0px";
      divSvg.style.opacity="0";
      div.appendChild(divSvg);
      divSvg.appendChild(svg);
      
      return {
        div:div,
        divSvg:divSvg,
        svg:svg,
      }

    }

    _pageRenderOutput(pageOutput){
        var divOut=document.createElement("div");
        divOut.style.position="absolute";
        divOut.style.width=pageOutput.width+"px";
        divOut.style.height=pageOutput.height+"px";
        divOut.style.left="0px";
        divOut.style.top=this._pagePosy+"px";
        divOut.style.overflow="hidden";
        this._pagePosy+=pageOutput.height;
        this._renderOutput.appendChild(divOut);

        /*var div=document.createElement("div");
        div.style.fontFamily="Arial";
        div.style.fontSize=30;
        div.style.width="100%";
        div.innerHTML="Page "+pageOutput.pageIndex+" . Time Process : "+(pageOutput.endTime-pageOutput.startTime)+"ms";
        document.body.appendChild(div);
        return;*/

        /*for(var i=0;i<pageOutput.divElement.length;i++) {
            divOut.appendChild(pageOutput.divElement[i]);
        }*/
    }
    async _startParsePage(){
        this.log("start parse page !");
        await this.visit(this._pageRender.divSvg);
        this.groupPartialFence();
        this.groupLineFracs();
        this.mergeAllLine();
        this.createLineRender();
        this.log("end parse pages !")

    }
    /**
     * 
     * @param {HTMLElement} node 
     * @returns 
     */
    async visit(node){
        if(!node) return;

        //if(node.setAttribute){
        //if(!node.nodeName) return;
       // this.log(node);
        if(node.nodeType!=1) return;
        node.setAttribute("nodeIndex",this._nodeIndex);
        this._nodeIndex++;
        //}
        
       //get transform attribute 
        var ttransform=(node.parentNode.getAttribute("text-transform"))? node.parentNode.getAttribute("text-transform")+"_":"";
        ttransform+=(node.getAttribute("transform"))? node.getAttribute("transform")+"_":"";
        if(ttransform) node.setAttribute("text-transform",ttransform);

        //get clippath attribute
        var tclippath=(node.parentNode.getAttribute("text-clippath"))? node.parentNode.getAttribute("text-clippath")+"_":"";
        if(node.getAttribute("clip-path")){
                var clipPath=node.getAttribute("clip-path").replaceAll("url(#","").replaceAll(")","");
                tclippath+=clipPath+" ";
        }
        if(tclippath) node.setAttribute("text-clippath",tclippath);

        //style node 
        if(node.nodeName=="svg:style") {
            if(this._pageNumber==1){
                var style = document.createElement('style');
                style.type = 'text/css';
                style.textContent=node.innerHTML;
                if(document.head) document.head.appendChild(style); 
            }
            
            return;
        }
        
        //image node
        if(node.nodeName=="svg:image"){
            var divImg=await this.createImage(node);
            if(divImg){
                this._currPageOut.divElement.push(divImg);
            }
            return ;
        }
    
        if(node.nodeName=="svg:path") {
            node.setAttribute("nodeIndex",this.nodeIndex);
            return ;
        }

        if(node.nodeName=="svg:tspan" && node.textContent!=""){
            var boxNode=node.getBoundingClientRect();
            //check special height size 
            var fontSize=node.getAttribute("font-size");
            var carr=node.getAttribute("carr");
            fontSize=(!isNaN(parseFloat(fontSize)))? parseFloat(fontSize):1;
            var sc={
                scaleX:1,
                scaleY:1,
                skewX:0,
                skewY:0
            }
            
            if(node.getAttribute("text-transform")){
                //rotate textNode
                sc=this.getScaleFromTransform(this.transformSvgToCss(node.getAttribute("text-transform")));
                if(sc.skewX!=0 || sc.skewY!=0){
                    var rotate=this.getRotateFromTransform("matrix("+sc.scaleX+","+sc.skewX+","+sc.skewY+","+sc.scaleY+",0,0)");
                    if(rotate>10){
                        this._currPageOut.rotateNodes.push(node);
                        return;
                    }
                }
            }

            boxNode.cy=boxNode.y;
            boxNode.cheight=boxNode.height;

            if(fontSize*Math.abs(sc.scaleY)+5<boxNode.height
            || (carr && this.isSpecialChar(carr))
            || (carr.length==1 && carr[0]!="m" && boxNode.width>boxNode.height)){
                this._calRealHeightByPixel(node,boxNode,sc);
                node.setAttribute("isRealFontSize",false);
            }else{
                node.setAttribute("isRealFontSize",true);
            }

            var realFontSize=fontSize*Math.abs(sc.scaleY);
            node.setAttribute("realFontSize",realFontSize);


            this.processTspanNode(node,boxNode,sc);
            return;
        }

        //var hasPathChild=false;
        var nodePath=[];
        if(node.childNodes && node.childNodes.length>0){
            for(var i=0;i<node.childNodes.length;i++){
                var chi=node.childNodes[i];
                if(chi.nodeName=="svg:path"){
                    var fill=chi.getAttribute("fill");
                    var stroke=chi.getAttribute("stroke");
                    if((fill && fill!="none")
                    || (stroke && stroke!="none")
                    ){
                        chi.setAttribute("nodeIndex",this._nodeIndex);
                        this._nodeIndex++;
                        nodePath.push(chi);
                        
                    }
                }else await this.visit(node.childNodes[i]);
            }
        }
        if(nodePath.length>0){
            var svg=this.createSvg(node,nodePath);
            
            if(svg) {
               this._currPageOut.divElement.push(svg); 
            }
        }
    }
    processTspanNode(node,boxNode,sc){
        //this.log(this._currPageOut.divElement.length);
    
        if(this._currPageOut.lines.length==0) {
            var line=this.createNewLine(node,boxNode,sc);
            this._currPageOut.lines.push(line);
        }else{

            //find line to push
            var lines=this._currPageOut.lines;
            var delta=Number.MAX_SAFE_INTEGER;
            var linePush=null;
            for(var i=lines.length-1;i>=0;i--){
                var line=lines[i];
                var deltaMax=Math.max(Math.abs(boxNode.y-line.y),Math.abs(boxNode.y+boxNode.height-line.y-line.height));
                if(deltaMax<2 && deltaMax<delta) {
                    linePush=line;
                    delta=deltaMax;
                }
                if(line.y+line.height<boxNode.y) break;
            }

            if(linePush){
                    linePush.nodes.push(node);
                    this.parseTextNode(node,boxNode,linePush,sc);
                    this.mergeRect(linePush,boxNode);
                    linePush.endIndex=Number(node.getAttribute("nodeIndex"));
            }else{
                for(var i=lines.length-1;i>=0;i--){
                    var line=lines[i];
                    if(boxNode.y+boxNode.height>=line.y+line.height){
                        var line=this.createNewLine(node,boxNode,sc);
                        if(i==lines.length-1) {
                            this._currPageOut.lines.push(line);
                        }else{
                            this._currPageOut.lines.splice(i+1,0,line);
                        }
                        break;
                    }
    
                    if(i==0){
                        var line=this.createNewLine(node,boxNode,sc);
                        this._currPageOut.lines.splice(0,0,line);
                        break;
                    }
                }
            }
        }
    }
    createNewLine(node,boxNode,sc){
        var line={
            lineIndex:this._lineIndex,
            carr:"",
            nodes:[node],
            words:[],
            maxWordWidth:boxNode.width,
            maxWordHeight:boxNode.height,
            wordsMerge:[],
            blocks:[],
            linesMerge:[],
            x:boxNode.x,
            y:boxNode.y,
            width:boxNode.width,
            height:boxNode.height,
            lineFracs:[],
            hasFenceLine:false,
            maxFenceWord:null,
            groupFenceIndex:-1,
            groupFenceHeight:-1,
            firstNormalWord:null,
            firstNotFenceWord:null,
            maxFontSize:Number(node.getAttribute("realFontSize")),
            minFontSize:Number(node.getAttribute("realFontSize")),
            minWordIndex:Number.MAX_SAFE_INTEGER,
            maxWordIndex:0,
            startIndex:Number(node.getAttribute("nodeIndex")),
            endIndex:Number(node.getAttribute("nodeIndex")),
        }
        this._lineIndex++;
        this._currPageOut.maxLineHeight=(this._currPageOut.maxLineHeight<line.height) ? line.height:this._currPageOut.maxLineHeight;
        this.parseTextNode(node,boxNode,line,sc);
        return line;
    }
    parseTextNode(node,boxNode,line,sc){
        
        //break word
        var nodeWhite=document.createElement("span");
        nodeWhite.innerHTML="&nbsp;";
        nodeWhite.style.fontFamily=node.getAttribute("font-family");
        nodeWhite.style.fontSize=node.getAttribute("font-size");
        nodeWhite.style.transformOrigin="0% 0%";
        nodeWhite.style.position="absolute";
        nodeWhite.style.transform="scale("+Math.abs(sc.scaleX)+","+Math.abs(sc.scaleY)+")";
        nodeWhite.style.whiteSpace="nowrap";
        document.body.parentNode.appendChild(nodeWhite);
        var boxWhite=nodeWhite.getBoundingClientRect();
        var whiteWidth=boxWhite.width/sc.scaleX;
        document.body.parentNode.removeChild(nodeWhite);

        var words=[];
       
        var ws=node.getAttribute("warr");
        var carr=node.getAttribute("carr");
        var x=node.getAttribute("x");
        ws=(ws)? ws.trim().split(" "):null;
        x=(x)? x.trim().split(" "):null;    
        //carr=(carr)? carr.split(" "):null;
        if(ws && x
            && x.length==ws.length && x.length==node.textContent.length){
            var word=null;
            for(var i=0;i<node.textContent.length;i++){
                if(node.textContent[i]==" ") continue;
                if(word==null || Number(x[i])-(Number(x[i-1])+Number(ws[i-1]))>whiteWidth/2 || node.textContent[i-1]==" "){
                    word={
                        t:node.textContent[i],
                        c:carr[i],
                        width:Number(ws[i])*sc.scaleX,
                        height:boxNode.height,
                        originWidth:Number(ws[i])*sc.scaleX,
                        originHeight:boxNode.height,
                        x:boxNode.x+(Number(x[i])-Number(x[0]))*sc.scaleX,
                        x0:Number(x[i]),
                        y:boxNode.y,
                        cy:boxNode.cy,
                        cheight:boxNode.cheight,
                        originLine:line,
                        currLine:line,
                        lineIndex:line.lineIndex,
                        originX:0,
                        originY:0,
                        whiteWidth:whiteWidth*sc.scaleX,
                        fontFamily:node.getAttribute("font-family"),
                        fontSize:node.getAttribute("font-size"),
                        isRealFontSize:(node.getAttribute("isRealFontSize")=="true")? true:false,
                        realFontSize:Number(node.getAttribute("realFontSize")),
                        color:node.getAttribute("fill"),
                        textTransform:node.getAttribute("text-transform"),
                        nodeIndex:this._nodeIndex,
                        wordIndex:this._wordIndex,
                        scaleX:sc.scaleX,
                        scaleY:sc.scaleY,
                        skewX:sc.skewX,
                        skewY:sc.skewY,
                        isSpecialChar:false,
                        isPartialFenceChar:false,
                        isFenceChar:false,
                        fenceIndex:-1,
                        //isFenceWord:false,
                    }
                    words.push(word);
                    this._wordIndex++;
                }else {
                    word.c+=carr[i];
                    word.t+=node.textContent[i];
                    word.width=(Number(x[i])+Number(ws[i])-word.x0)*sc.scaleX;//Number(ws[i])*sc.scaleX;
                }
            }
        }
           
        for(var i=0;i<words.length;i++) {
            var wo=words[i];
           // line.carr+=words[i].c+" ";

            if(this.isSpecialChar(wo.c)) wo.isSpecialChar=true;

            if((this.isFenceChar(wo.c[0]) && wo.height>=2*wo.width) || (wo.height>3*wo.width && wo.isSpecialChar==true)) wo.isFenceChar=true;
            
            if(wo.cheight>2*wo.width && this.isPartialFenceChar(wo.c)) {
                this.pushWordToPartialFence(wo);
            }

            this.pushWordToLine(words[i],line.words,line);
        }
    }
    pushWordToPartialFence(word){
        if(this._currPageOut.partialFences.length==0){
            this._currPageOut.partialFences.push(word);
        }else{
            //find pos to push
            for(var i=this._currPageOut.partialFences.length-1;i>=0;i--){
                var wo=this._currPageOut.partialFences[i];
                if(word.y>=wo.y){
                    if(i==this._currPageOut.partialFences.length-1) this._currPageOut.partialFences.push(word)
                    else{
                        this._currPageOut.partialFences.splice(i+1,0,word);
                    }
                    break;
                }
                if(i==0){
                    this._currPageOut.partialFences.splice(0,0,word);
                }
            }
        }
    }
    pushWordToLine(word,words,line){
        //this.log(words);
        if(words.length==0){
            words.push(word);
        }else{
            //find pos to push
            for(var i=words.length-1;i>=0;i--){
                var wo=words[i];

                if(wo.x==word.x 
                && wo.width==word.width 
                && wo.y==word.y
                && wo.height==word.height
                && wo.textContent==word.textContent) return;

                if(word.x>=wo.x){
                    if(i==words.length-1) words.push(word)
                    else{
                        words.splice(i+1,0,word);
                    }
                    break;
                }
                if(i==0){
                    words.splice(0,0,word);
                }
            }
        }
        
        line.minWordIndex=(word.wordIndex<line.minWordIndex) ? word.wordIndex:line.minWordIndex;
        line.maxWordIndex=(word.wordIndex>line.maxWordIndex) ? word.wordIndex:line.maxWordIndex;

        var minx=(word.x<line.x)? word.x:line.x;
        var miny=(word.y<line.y)? word.y:line.y;
        var maxx=(word.x+word.width>line.x+line.width)? word.x+word.width:line.x+line.width;
        var maxy=(word.y+word.height>line.y+line.height)? word.y+word.height:line.y+line.height;
        line.x=minx;
        line.width=maxx-minx;
        line.y=miny;
        line.height=maxy-miny;
        this._currPageOut.maxLineHeight=(this._currPageOut.maxLineHeight<line.height) ? line.height:this._currPageOut.maxLineHeight;
        
        if(!line.firstNotFenceWord && !word.isFenceChar){
            line.firstNotFenceWord=word;
            line.maxFontSize=word.realFontSize;
        }

        if(word.isRealFontSize==true && !word.isFenceChar){
            line.maxFontSize=(line.maxFontSize<word.realFontSize)? word.realFontSize:line.maxFontSize;
            line.minFontSize=(line.minFontSize>word.realFontSize)? word.realFontSize:line.minFontSize;
        }
        if(word.isFenceChar){
            line.maxFenceWord=(!line.maxFenceWord || line.maxFenceWord.height<word.height) ? word : line.maxFenceWord
        }

        word.currLine=line;

        if(words==line.words){

            if(!word.isSpecialChar){
                if(!line.firstNormalWord) {
                    line.firstNormalWord=word;
                }else{
                    if(word.x<line.firstNormalWord.x) line.firstNormalWord=word;
                }
            }

            line.carr+=word.c;
            line.maxWordHeight=(line.maxWordHeight<word.height)? word.height:line.maxWordHeight;
            line.maxWordWidth=(line.maxWordWidth<word.x+word.width)? word.x+word.width:line.maxWordWidth;
        }

    }

    groupPartialFence(){
        var partialFences=this._currPageOut.partialFences;
        for(var i=0;i<partialFences.length;i++){
            var wo=partialFences[i];
            wo.partialFencesIndex=i;
            wo.isPartialFenceChar=true;
            var woGroup=[wo];
            var numDiffText=0;
            var height=wo.height;
            for(var j=i+1;j<partialFences.length;j++){
                var lwo=woGroup[woGroup.length-1];
                var woj=partialFences[j];
                if(Math.abs(lwo.x-woj.x)<1 
                && Math.abs(lwo.width-woj.width)<1
                && woj.cy<lwo.cy+lwo.cheight){
                    woGroup.push(woj);
                    height+=woj.cheight;
                    if(woj.c!=lwo.c) numDiffText++;
                }
                if(woj.cy>lwo.cy+lwo.cheight+2) break;
            }
            if(numDiffText>1){
                this._fenceIndex++;
                for(var j=0;j<woGroup.length;j++){
                    if(height> woGroup[j].originLine.groupFenceHeight){
                        woGroup[j].originLine.groupFenceIndex=this._fenceIndex;
                        woGroup[j].originLine.groupFenceHeight=height;
                        woGroup[j].groupFenceIndex=this._fenceIndex;
                        //woGroup[j].isSpecialChar=false;
                    }
                }
            }
        }
    }
    groupLineFracs(){
        var lineFracs=this._currPageOut.lineFracs;
        for(var i=0;i<lineFracs.length;i++){
            var frac=lineFracs[i];
            var linePush=null;
            var deltaToMiddle=this._currPageOut.height;
            var hasInLine=false;
            for(var j=0;j<this._currPageOut.lines.length;j++){
                var line=this._currPageOut.lines[j];
                if(line.words.length==0) continue;
                if(line.height<3) continue;

                var delta=(line.height<8)? 2:line.height/4

                if(frac.y>=line.y+delta && frac.y+frac.height<=line.y+line.height+4){
                    hasInLine=true;
                    var needPush=false;
                    var delta=Math.abs(frac.y+frac.height/2-(line.y+line.height/2));

                    if(!linePush) needPush=true;
                    else{
                        if(deltaToMiddle<3 && delta<3) {
                            if(this.getDistanceX(frac,line)<this.getDistanceX(frac,linePush)) needPush=true;
                        }else{
                            if(delta<deltaToMiddle) needPush=true;
                        }
                    }
                    if(needPush){
                        linePush=line;
                        deltaToMiddle=delta;
                    }
                }
                
                if(line.y>frac.y+frac.height) break;
            }
            if(linePush){
                linePush.lineFracs.push(frac);
                linePush.maxWordWidth=(linePush.maxWordWidth<frac.x+frac.width)? frac.x+frac.width:linePush.maxWordWidth;
            }
            if(!hasInLine){
                //not inline frac 2 line
            }
        }
    }

    mergeLine(line,lineMerge,skipRecheckMainWord){
        //this.log("before merge !!!");
        //this.log(line);

        /*var isNeedRecheckMainWord=false;
        var firstWord=this.getFirstWord(line);
        var firstWordMerge=this.getFirstWord(lineMerge);
        if(firstWordMerge.x<=firstWord.x && lineMerge.maxWordHeight>line.maxWordHeight-2.2) isNeedRecheckMainWord=true;

        isNeedRecheckMainWord=(skipRecheckMainWord && isNeedRecheckMainWord)? true:false;*/
 
        lineMerge.isMerge=true;
        lineMerge.wordsMerge.forEach(word=>{
            this.pushWordToLine(word,line.wordsMerge,line);
            //var midHeight=(line.words.length>0)? line.words[0].y+line.words[0].height/2:line.y+line.height/2;
           // var delta=(word.height<line.maxWordHeight/2)? 3:1.5;
           // if(word.height>3*line.maxWordHeight/4) delta=Math.min(word.height,line.maxWordHeight)/4;
           // if(Math.abs(word.y+word.height/2-midHeight)<delta && word.cheight>2+line.maxWordHeight/2){
           //     this.pushWordToLine(word,line.words,line);
           // }
           var firstChild=this.getFirstWord(line);
           if(this.checkMainWordLine(word,firstChild.y+firstChild.height/2,line.maxWordHeight)) this.pushWordToLine(word,line.words,line);
        })

        line.linesMerge.push(lineMerge);
        if(line.groupFenceIndex==-1 && lineMerge.groupFenceIndex>=0) {
            line.groupFenceIndex=lineMerge.groupFenceIndex;
        }
       
        lineMerge.lineFracs.forEach(frac=>{
            if(frac.y>line.y+line.height/8) line.lineFracs.push(frac);
        })

        /*if(isNeedRecheckMainWord){
            this.recheckMainWordLine(line,firstWordMerge.y+firstWordMerge.height/2,lineMerge.maxWordHeight);
        }*/
    }
    recheckMainWordLine(line,midHeight,maxWordHeight){
        line.words=[];
        line.maxWordHeight=0;
        for(var i=0;i<line.wordsMerge.length;i++){
            var wo=line.wordsMerge[i];

            /*var delta=(wo.height<maxWordHeight.height/2)? 3:1.5;
            if(wo.height>=3*maxWordHeight/4) delta=Math.min(wo.height,maxWordHeight)/4;
            if(Math.abs(wo.y+wo.height/2-midHeight)<delta && wo.cheight>=2+maxWordHeight/2) line.words.push(wo);*/
            if(this.checkMainWordLine(wo,midHeight,maxWordHeight)) {
                line.words.push(wo);
                line.maxWordHeight=(line.maxWordHeight<wo.height)? wo.height:line.maxWordHeight;
            }
        }
    }
    checkMainWordLine(wo,midHeight,maxWordHeight){
        if(wo.cy+wo.cheight<midHeight 
            || wo.cy>midHeight){
                return false;
            }

        if(wo.y+wo.height<midHeight 
            || wo.y>midHeight){
                if(wo.height<5 &&(Math.abs(wo.y+wo.height/2-midHeight)<3)) return true;
                else return false;
            }

        //cross over midHeight
        var delta=Math.min(maxWordHeight,wo.height)/4;
        delta=(delta<2) ? 2:delta;
        if(Math.abs(wo.y+wo.height/2-midHeight)<delta) return true;
        return false;    
    }

    mergeAllLine(){
        //init wordMerge
        for(var i=0;i<this._currPageOut.lines.length;i++){
            var line=this._currPageOut.lines[i];
            line.wordsMerge=line.words.concat([]);
            line.originWidth=line.width;
            line.originHeight=line.height;
            line.originX=line.x;
            line.originY=line.y;
            if(line.words.length==0) line.isMerge=true;
        }
        //merge all line same partial 
       this.mergePartialFenceLine();

       this.mergeIncluceFenceLine();

       this.mergeIncludeLine();

       this.mergeFracLine();

       this.mergeSmallLine();

    }
   
    mergePartialFenceLine(){
        do{
            var hasMerge=false;
            for(var i=0;i<this._currPageOut.lines.length;i++){
                var line=this._currPageOut.lines[i];
                if(line.isMerge==true) continue;
                if(line.groupFenceIndex>=0){
                    //find all line has same fenceIndexs
                    for(var j=0;j<this._currPageOut.lines.length;j++){
                        var linej=this._currPageOut.lines[j];
                        if(linej.isMerge==true || line==linej) continue;
                        if(linej.groupFenceIndex==line.groupFenceIndex){
                            this.mergeLine(line,linej);
                            this.recheckMainWordLine(line,line.y+line.height/2,line.height);
                            if(line.words.length==0){
                                var firstWord=this.getFirstWord(line);
                                this.recheckMainWordLine(line,firstWord.y+firstWord.height/2,firstWord.height);
                            }
                            hasMerge=true;
                            break;
                        }
                        if(linej.y>line.y+line.height+this._currPageOut.maxLineHeight) break;
                    }
                }
                if(hasMerge) break;
            }
            
        }while(hasMerge==true);
    }

    mergeIncluceFenceLine(){
        do{
            var hasMerge=false;
            for(var i=0;i<this._currPageOut.lines.length;i++){
                var line=this._currPageOut.lines[i];
                if(line.isMerge==true) continue;

                var lineMergeTo=null;
                
                for(var j=0;j<this._currPageOut.lines.length;j++){
                    var linej=this._currPageOut.lines[j];
                    if(linej.isMerge==true || line==linej) continue;

                    var needMerge=false;

                    if(this.isFenceLine(linej)) {
                        //isFenceLine
                        if(linej.groupFenceIndex>=0 && linej.height>=line.height){
                            var overlapY=this.getDistanceY(linej,line);
                            if(overlapY<0){
                                if(line.groupFenceIndex>=0){
                                    if(Math.abs(overlapY)>=line.height/4) needMerge=true;
                                }else{
                                    if(Math.abs(overlapY)>=line.height/2) needMerge=true;
                                }
                            }
                        }else{
                            if(linej.maxFenceWord){
                                var overlapY=this.getDistanceY(linej.maxFenceWord,line);
                                var minHeight=Math.min(line.height,linej.maxFenceWord.height);
                                if(overlapY<0 && Math.abs(overlapY)>=3*line.height/4 && linej.maxFenceWord.height>line.height) needMerge=true;
                            }else{
                                //imposible
                            } 
                        }
                    }
  
                    if(needMerge){
                        if(!lineMergeTo) lineMergeTo=linej
                        else{
                           if(linej.height>lineMergeTo.height){
                                lineMergeTo=linej;
                           }else if(linej.height==lineMergeTo.height){
                                var isLineMergeToOverlapIndex=this.isOverlapWordIndex(line,lineMergeTo);
                                var isLineJOverlapIndex=this.isOverlapWordIndex(line,linej);

                                if(isLineJOverlapIndex && !isLineMergeToOverlapIndex) lineMergeTo=linej;
                                else if(!isLineJOverlapIndex && isLineMergeToOverlapIndex) {
                                    //keep lineMergeTo
                                }
                                else{
                                        var minIndexMergeTo=Math.min(Math.abs(line.minWordIndex-lineMergeTo.minWordIndex),Math.abs(line.maxWordIndex-lineMergeTo.maxWordIndex));
                                        var minIndexJ=Math.min(Math.abs(line.minWordIndex-linej.minWordIndex),Math.abs(line.maxWordIndex-linej.maxWordIndex));
                                        if(minIndexJ<=minIndexMergeTo) lineMergeTo=linej;
                                }
                           }
                        }
                    }

                    if(linej.y>line.y+line.height+this._currPageOut.maxLineHeight) break;
                }

                if(lineMergeTo) {
                    var needRecheckMainWord=false;
                    var firstWordLine=this.getFirstWord(line);
                    var firstWordLineMerge=this.getFirstWord(lineMergeTo);
                    if(firstWordLine.x<firstWordLineMerge.x && line.maxWordHeight>=lineMergeTo.maxWordHeight-2) needRecheckMainWord=true;
                    this.mergeLine(lineMergeTo,line);
                    hasMerge=true;
                    if(needRecheckMainWord) {
                        this.recheckMainWordLine(lineMergeTo,firstWordLine.y+firstWordLine.height/2,line.maxWordHeight);
                    }
                    break;
                }
            }
            
        }while(hasMerge==true); 
    }

    checkMergeInclude(line,lineMerge){
        for(var i=0;i<line.wordsMerge.length;i++){
            var wo=line.wordsMerge[i];
            for(var j=0;j<lineMerge.wordsMerge.length;j++){
                var woo=lineMerge.wordsMerge[j];
                //var isArrowWord=(wo.isSpecialChar && (wo.width>4*wo.height || (wo.height<5 && wo.width>2.2*wo.height)))? true:false ;//case arrow text in middle 
                //var delta1=(woo.width<5)? 1.2:4;var delta2=(wo.width<5)? 1.2:4;
                var isOverlapX=this.isOverlapX(wo,woo);//(wo.x+wo.width<woo.x+delta1 || woo.x+woo.width<wo.x+delta2) ? false:true;
                if(isOverlapX) {
                    if(!this.isSpecialArrowChar(woo) && !this.isSpecialArrowChar(wo)) return false;
                   //return false;
                }
            }
        }
        return true;
    }
    mergeIncludeLine(){
        do{
            var hasMerge=false;
            for(var i=0;i<this._currPageOut.lines.length;i++){
                var line=this._currPageOut.lines[i];
                if(line.isMerge==true) continue;

                var lineMergeTo=null;
                var minDistance=this._currPageOut.width;

                for(var j=0;j<this._currPageOut.lines.length;j++){
                    var linej=this._currPageOut.lines[j];
                    if(linej.isMerge==true || line==linej) continue;
                    if(linej.height<line.height) continue;

                    if(line.x+line.width+line.height<linej.x
                        || linej.x+linej.width+linej.height<line.x) continue
                    
                    var needMerge=false;
                    var minDeltaMid=(line.height<9)? 2:line.height/4;

                    if(line.y>=linej.y-1
                        && line.y+line.height<=linej.y+linej.height+1
                        && (Math.abs(line.y+line.height/2-(linej.y+linej.height/2)) < 2)){
                            if(this.checkMergeInclude(line,linej)) needMerge=true;
                          // needMerge=true;
                    }    
                        
                    if(needMerge){
                        if(!lineMergeTo) lineMergeTo=linej
                        else{
                           var isLineMergeToOverlapIndex=this.isOverlapWordIndex(line,lineMergeTo);
                           var isLineJOverlapIndex=this.isOverlapWordIndex(line,linej);

                           if(isLineJOverlapIndex && !isLineMergeToOverlapIndex) lineMergeTo=linej;
                           else if(!isLineJOverlapIndex && isLineMergeToOverlapIndex) {
                               //keep lineMergeTo
                           }
                           else{
                                var minIndexMergeTo=Math.min(Math.abs(line.minWordIndex-lineMergeTo.minWordIndex),Math.abs(line.maxWordIndex-lineMergeTo.maxWordIndex));
                                var minIndexJ=Math.min(Math.abs(line.minWordIndex-linej.minWordIndex),Math.abs(line.maxWordIndex-linej.maxWordIndex));
                                if(minIndexJ<=minIndexMergeTo) lineMergeTo=linej;
                           }
                        }
                    } 
                    
                    if(linej.y>line.y+line.height+this._currPageOut.maxLineHeight) break;
                }

                if(lineMergeTo) {
                    this.mergeLine(lineMergeTo,line);
                    hasMerge=true; 
                    break;
                }
            }
            
        }while(hasMerge==true); 
    }

    checkMergeFrac(line,lineMerge){
        var result={
            canMerge:false,
            minDistance:this._currPageOut.height,
            maxDistance:-this._currPageOut.height,
            needRecheckMainWord:false,
            wordsNear:[],
        }

        var hasWordNearFrac=false;
        var hasWordInFrac=false;
        var hasWordIndexOutside=false;
        
        for(var i=0;i<lineMerge.wordsMerge.length;i++){
            var wo=lineMerge.wordsMerge[i];
            var rs=this.checkWordHasFrac(wo,line);
            if(rs.hasFrac==true) {
                hasWordInFrac=true;
                if(rs.hasNearFrac==true) {
                    hasWordNearFrac=true;
                    result.wordsNear=result.wordsNear.concat(rs.wordsNear);
                }
                if(rs.hasIndexOutSide==true) hasWordIndexOutside=true;
                result.minDistance=(rs.minDistance<result.minDistance)? rs.minDistance:result.minDistance;
                result.maxDistance=(rs.maxDistance<result.maxDistance)? rs.maxDistance:result.maxDistance;
            
            }
            
            if(!rs.hasFrac){
                // var isOutFracLine=(wo.x+wo.width<line.x || wo.x>line.maxWordWidth)? true:false;
                if(!(wo.x+wo.width<line.x || wo.x>line.maxWordWidth)){    
                    result.canMerge=false;
                    return result;    
                }
                if(wo.x+wo.width<line.x){
                    result.needRecheckMainWord=true;
                }
            }
        }

        if(hasWordNearFrac==true){
            //has at least one word near fracLine that okie can merge
            /*if(result.wordsNear.length==1){
                var wo=result.wordsNear[0];
                if(wo.isRealFontSize==false && wo.height>2*wo.realFontSize && wo.height>2*wo.width){
                    //special case sqrt
                    result.canMerge=false;
                    return result;        
                }
            }*/
            result.canMerge=true;
            return result;
        }else{
            if(hasWordInFrac){
                //all hasFrac is too far 
                /*if(hasWordIndexOutside==false) {
                    result.canMerge=true;
                    return result;
                }else{*/
                    //check hasFrac at special case 
                    result.canMerge=this.checkHasFracSpecialCase(line,lineMerge);
                    return result;
                //}
            }else{
                //not has any word in frac
                result.canMerge=false;
                return result;  
            }
        } 
    }

    checkWordHasFrac(wo,line){
        var result={
            hasFrac:false,
            hasNearFrac:false,
            wordsNear:[],
            hasIndexOutSide:false,
            minDistance:this._currPageOut.height,
            maxDistance:-this._currPageOut.height,
        }
        
        for(var j=0;j<line.lineFracs.length;j++){
            var frac=line.lineFracs[j];

            if(wo.x>=frac.x-4 && wo.x+wo.width<=frac.x+frac.width+4){
                if(frac.y<wo.y+wo.height/4 || wo.y+3*wo.height/4<frac.y) {
                    result.hasFrac=true;
                    var distance=(frac.y<wo.y+2) ? Math.abs(wo.y-frac.y):Math.abs(frac.y-wo.y-wo.height);
                    var delta=(wo.height<6)? 5:3*wo.height/4; 
                    if(distance<delta){
                        if(!this.isSpecialSqrtChar(wo)) result.hasNearFrac=true;
                        result.wordsNear.push(wo);
                    }
                    if(frac.y>wo.y && wo.wordIndex<line.wordsMerge[0].wordIndex) result.hasIndexOutSide=true;
                    if(frac.y<wo.y && wo.wordIndex>line.wordsMerge[line.wordsMerge.length-1].wordIndex) result.hasIndexOutSide=true;
                    result.minDistance=(result.minDistance>distance) ? distance:result.minDistance;
                    result.maxDistance=(result.maxDistance<distance) ? distance:result.maxDistance;
                   // break;
                }
            }
            
        }
        
        return result;
    }

    checkHasFracSpecialCase(line,lineMerge){
        return false;
    }

    mergeFracLine(){
        do{
            var hasMerge=false;
            for(var i=0;i<this._currPageOut.lines.length;i++){
                var line=this._currPageOut.lines[i];
                if(line.isMerge==true) continue;

                var lineMergeTo=null;
                var minDistanceMergeTo=-1;
                var needRecheckMainWord=false;
                for(var j=0;j<this._currPageOut.lines.length;j++){
                    var linej=this._currPageOut.lines[j];
                    if(linej.isMerge==true || line==linej) continue;
                    //if(linej.maxFontSize>line.maxFontSize+2.2) continue; // not same font size or not overlap x

                    var isOverlap=(line.y+line.height<linej.y-2 || linej.y+linej.height<line.y-2) ? false:true;
                    if(isOverlap 
                        || (this.isOverlapWordIndex(line,linej) && this.getDistanceLineNotOverlap(line,linej)<0.75*Math.min(line.height,linej.height))){
                        
                        var result=this.checkMergeFrac(linej,line);
                        
                        if(result.canMerge==true){
                           
                            if(!lineMergeTo || result.minDistance<minDistanceMergeTo) {
                                lineMergeTo=linej;
                                minDistanceMergeTo=result.minDistance;
                                needRecheckMainWord=result.needRecheckMainWord;
                            }
                        }
                    }
                    if(linej.y>line.y+line.height+this._currPageOut.maxLineHeight) break;
                }

                if(lineMergeTo) {
                    this.mergeLine(lineMergeTo,line);
                    if(needRecheckMainWord){
                        var firstWord=this.getFirstWord(line);
                        this.recheckMainWordLine(lineMergeTo,firstWord.y+firstWord.height/2,line.maxWordHeight);
                    }
                    hasMerge=true;
                    break;
                }
            }
            
        }while(hasMerge==true);
    }

    checkMergeSmallHeight(line,lineMerge){
        var result={
            hasLineCanMerge:false,
            hasLineOverlapHeight:false,
        }

        var arrMerge=[lineMerge];
        arrMerge=arrMerge.concat(lineMerge.linesMerge);
        var arr=[line];
        arr=arr.concat(line.linesMerge);

        for(var i=0;i<arrMerge.length;i++){
            for(var j=0;j<arr.length;j++){
                if(arrMerge[i].maxWordHeight<arr[j].maxWordHeight+2) result.hasLineCanMerge=true;
                var overlapY=this.getDistanceY(arrMerge[i],arr[j]);
                if(overlapY<0){
                    var delta=arrMerge[i].height/4-1;
                    delta=(delta<2)? 0.5:delta;
                    if(Math.abs(overlapY)>=delta){
                        result.hasLineOverlapHeight=true;
                    }
                }
            }
        }
        
        
        return result;
    }

    checkMergeSmallSingleLine(line,lineMerge){
        var result={
            canMerge:false,
            isOverlapMinHeight:false,
            hasOverlapSpecialWord:false,
            blockWord:null,
            block:null,
            minDistance:this._currPageOut.height,
            maxDistance:-this._currPageOut.height,
        }

        var overlapY=this.getDistanceY(line,lineMerge);
        result.isOverlapMinHeight=(overlapY<0 && Math.abs(overlapY)>=lineMerge.height/4-1);
        
        //block lineMerge
        var blocks=[];
        var currBlock=null;
        for(var i=0;i<lineMerge.words.length;i++){
            var wo=lineMerge.words[i];
            //if(this.isSpecialArrowChar(wo)) continue;
            if(i==0 || (currBlock && wo.x>currBlock.x+currBlock.width+2*wo.whiteWidth-10000000)){
                currBlock={
                    words:[wo],
                    x:wo.x,
                    y:wo.y,
                    width:wo.width,
                    height:wo.height,
                    cheight:wo.cheight,
                    maxFontSize:wo.realFontSize,
                    isSpecialChar:wo.isSpecialChar,
                }
                blocks.push(currBlock);
            }else{
                currBlock.words.push(wo)
                currBlock.cheight=(currBlock.cheight<wo.cheight)? wo.cheight:currBlock.cheight;
                currBlock.maxFontSize=(currBlock.maxFontSize>wo.realFontSize)? wo.realFontSize:currBlock.maxFontSize;
                if(wo.isSpecialChar) currBlock.isSpecialChar=true;
                this.mergeRect(currBlock,wo);
            }
        }


        

        //check overlap block to line
        for(var i=0;i<blocks.length;i++){
            var block=blocks[i];
            var blockWord=null;
            if(this.isSpecialArrowChar(block.words[0])) continue;
            if(this.isSpecialSqrtChar(block.words[0])) continue;
            var blockOverlapWord=[];
            var blockDistance=this._currPageOut.height;

            //case smaller word
            for(var j=0;j<line.wordsMerge.length;j++){
                var wo=line.wordsMerge[j];

                var isOverlapX=this.isOverlapX(wo,block);
                var distance=Math.max(this.getDistanceX(wo,block),this.getDistanceY(wo,block));
                if(blockDistance>distance){
                    blockDistance=distance;
                    blockWord=wo;
                }
                //blockDistance=(distance<blockDistance)? distance:blockDistance;

                if(isOverlapX) {
                    if(line.words.indexOf(wo)>=0 && !this.isSpecialArrowChar(wo) && !this.isSpecialSqrtChar(wo)) {
                        blockOverlapWord.push(wo);
                    }
                }
            }

            
            //special block over line
            var isBlockOverlapOk=false;
            if(block.words.length==1 
                && block.words[0].c.length==1){ // overlap top with one character over
                    var overlapY=this.getDistanceY(block,line);
                    if(overlapY<0 && Math.abs(overlapY)>block.height/2){
                        isBlockOverlapOk=true;
                    }
            }

            //block has frac line 
            if(!isBlockOverlapOk){
                var blockHasFrac=this.checkWordHasFrac(block,line);
                if(blockHasFrac.hasFrac){
                    isBlockOverlapOk=true;
                }
            }

            
            //block overlapSpecialWord
            if(blockOverlapWord.length==1){
                var wordOverlap=blockOverlapWord[0];
                var dis=this.getDistanceY(block,line);
                var delta=(block.height<5)? 5:block.height;
                //dis=(dis<5)? :dis;

                if(dis<delta && this.isSpecialCanOverWord(wordOverlap) && wordOverlap.height>1.6*block.height){  // overlap infinity ,sum 
                    wordOverlap.isSpecialCanOverWord=true;
                    block.isSpecialCanOverWord=true;
                    isBlockOverlapOk=true; 
                    result.hasOverlapSpecialWord=true;
                }
                
            }

            //if(blockOverlapWord.length>0){
           //     var wordOverlap=blockOverlapWord[0];
            //    if(block.words.length==1 && block.words[0].c.length==1){
            //        var overlapY=this.getDistanceY(block,line);
            //        if(overlapY<0 && Math.abs(overlapY)>2*block.height/4) isBlockOverlapOk=true; //case only once character overlap
            //    }
           // }
            
           

            if(isBlockOverlapOk){
                result.minDistance=(result.minDistance>blockDistance)? blockDistance:result.minDistance;
                result.maxDistance=(result.maxDistance<blockDistance)? blockDistance:result.maxDistance;
                if(blockDistance<result.minDistance){
                    result.minDistance=blockDistance;
                    result.block=block;
                    result.blockWord=blockWord;
                }
            }else{
                //check blockOverlap 
                if(blockOverlapWord.length>1) { //overlap one or more main word 
                    result.canMerge=false;
                    return result;
                }else{
                    var isOverlapOk=false;
                    if(blockOverlapWord.length==1){

                        var wordOverlap=blockOverlapWord[0];
                        
                        if(block.y>wordOverlap.y && this.isWordCanOverlapBottom(wordOverlap)) {
                            isOverlapOk=true;  // overlap min,max,lim
                            result.isOverlapMinHeight=true;
                        }
    
                        if(block.y<wordOverlap.y && block.isSpecialChar==true && block.width>2*block.height && 1.5*block.height<wordOverlap.height) {
                            isOverlapOk=true; // overlap overhead case line
                           // result.isOverlapMinHeight=true;
                        }

                    }else{
                        isOverlapOk=true;
                    }
                    
                    if(isOverlapOk){
                        result.minDistance=(result.minDistance>blockDistance)? blockDistance:result.minDistance;
                        result.maxDistance=(result.maxDistance<blockDistance)? blockDistance:result.maxDistance;
                        if(blockDistance<result.minDistance){
                            result.minDistance=blockDistance;
                            result.block=block;
                            result.blockWord=blockWord;
                        }
                    }else{
                        result.canMerge=false;
                        return result;
                    }
                }
            }
        }

        //not overlap is ok
        result.canMerge=true;
        return result;
        
    }

    isWordCanOverlapBottom(word){
        //return true;
        var arr=['lim',"min",'max'];
        for(var i=0;i<arr.length;i++){
            if(word.c.toLowerCase().indexOf(arr[i])>=0) return true;
        }
        return false;
    }

    checkMergeSmall(line,lineMerge){

        var result={
            canMerge:false,
            isOverlapMinHeight:false,
            hasOverlapSpecialWord:false,
            
            minDistance:this._currPageOut.height,
            maxDistance:-this._currPageOut.height,
        }
        
        
        
        /*var isMergeSmallHeight=this.checkMergeSmallOverlapHeight(line,lineMerge);
        var isMergeSmallOverlapIndex=(this.isOverlapWordIndex(line,lineMerge) && this.getDistanceLineNotOverlap(line,lineMerge)<1.2*Math.min(line.height,lineMerge.height))

        

        if(!isMergeSmallHeight && !isMergeSmallOverlapIndex) {
            return result;
        }*/

        //okie has overlap
        var arrMerge=[lineMerge];
        arrMerge=arrMerge.concat(lineMerge.linesMerge);
        
        for(var i=0;i<arrMerge.length;i++){
            var lineM=arrMerge[i];
            var rs=null;
            if(lineM.linesMerge.length==0 || lineM==lineMerge){
                rs=this.checkMergeSmallSingleLine(line,lineM);   
            }else{
                rs=this.checkMergeSmall(line,lineM);
            }
            
            if(rs.canMerge==false) { // not canMerge 
                result.canMerge=false;
                return result;
            }else{ // canMerge
                if(rs.isOverlapMinHeight) result.isOverlapMinHeight=true;
                if(rs.hasOverlapSpecialWord) result.hasOverlapSpecialWord=true;
                result.minDistance=(result.minDistance>rs.minDistance)? rs.minDistance:result.minDistance;
                result.maxDistance=(result.maxDistance<rs.maxDistance)? rs.maxDistance:result.maxDistance;
            }
        }

       // if(!result.isOverlapMinHeight && !result.hasOverlapSpecialWord) {
       //     if(2.2*lineMerge.height<line.height) result.canMerge=true
       //     else result.canMerge=false;
       // }
       // else result.canMerge=true;

       result.canMerge=true;

        return result;
    }

    mergeSmallLine(){
        do{
            var hasMerge=false;
            for(var i=0;i<this._currPageOut.lines.length;i++){
                var line=this._currPageOut.lines[i];
                if(line.isMerge==true) continue;

                var lineMergeTo=null;
                var minDistanceMergeTo=this._currPageOut.height;
                for(var j=0;j<this._currPageOut.lines.length;j++){
                    var linej=this._currPageOut.lines[j];
                    if(linej.isMerge==true || line==linej) continue;

                   // var firstWordLine=this.getFirstWord(line);
                   // var firstWordj=this.getFirstWord(linej);
                  //  if(firstWordLine.x<firstWordj.x && firstWordLine.height>firstWordj.height-2) continue; // both left and bigger not merge

                    //if(line.x+line.width+Math.min(line.height,line.width)<linej.x || linej.x+linej.width+Math.min(linej.height,linej.width)<line.x) continue;
                    //if(line.wordsMerge[0].x<=lineMergeTo.wordsMerge[0].x 
                    //    && line.wordsMerge[0].height>=lineMergeTo.wordsMerge[0].height)

                    //if(firstWordLine.height>firstWordj.height) continue ; //only merge small to bigger
                    var checkH=this.checkMergeSmallHeight(linej,line);
                    if(!checkH.hasLineCanMerge) continue;
                    
                    var isMergeSmallHeight=checkH.hasLineOverlapHeight;
                    var isMergeSmallOverlapIndex=(this.isOverlapWordIndex(linej,line) && this.getDistanceLineNotOverlap(linej,line)<1.2*Math.min(linej.height,line.height))

                    if(!isMergeSmallHeight && !isMergeSmallOverlapIndex) continue;
                
                    //var isOverlap=(line.y+line.height<linej.y || linej.y+linej.height<line.y) ? false:true;
                   
                   // if(isOverlap 
                   //     || (this.isOverlapWordIndex(line,linej) && this.getDistanceLineNotOverlap(line,linej)<1.2*Math.min(line.height,linej.height))){
                        
                        var result=this.checkMergeSmall(linej,line);
                       
                        if(result.canMerge==true && !result.isOverlapMinHeight && !result.hasOverlapSpecialWord) {
                            if(2.2*line.maxWordHeight<linej.maxWordHeight) result.canMerge=true
                            else result.canMerge=false;
                        }

                        if(line.x+line.width<=linej.x || linej.x+linej.width<=line.x){
                            var delta=Math.min(linej.height,linej.width);
                            delta=(delta<4)? Math.max(linej.height,linej.width):delta;
                            if(result.minDistance>delta) result.canMerge=false;
                        }

                        
                        if(result.canMerge==true){
                            if(!lineMergeTo) {
                                lineMergeTo=linej;
                                minDistanceMergeTo=result.minDistance;
                            }else{
                                if(result.minDistance<2 && minDistanceMergeTo<2){
                                    var isLineMergeToOverlapIndex=this.isOverlapWordIndex(line,lineMergeTo);
                                    var isLineJOverlapIndex=this.isOverlapWordIndex(line,linej);

                                    if(isLineJOverlapIndex && !isLineMergeToOverlapIndex) lineMergeTo=linej;
                                    else if(!isLineJOverlapIndex && isLineMergeToOverlapIndex) {
                                        //keep lineMergeTo
                                    }
                                    else{
                                            var minIndexMergeTo=Math.min(Math.abs(line.minWordIndex-lineMergeTo.minWordIndex),Math.abs(line.maxWordIndex-lineMergeTo.maxWordIndex));
                                            var minIndexJ=Math.min(Math.abs(line.minWordIndex-linej.minWordIndex),Math.abs(line.maxWordIndex-linej.maxWordIndex));
                                            if(minIndexJ<=minIndexMergeTo) lineMergeTo=linej;
                                    }

                                    if(lineMergeTo==linej) minDistanceMergeTo=result.minDistance;
                                }else{
                                    if(result.minDistance<minDistanceMergeTo){
                                        lineMergeTo=linej;
                                        minDistanceMergeTo=result.minDistance;
                                    }
                                }
                            }
                        }
                   // }

                    if(linej.y>line.y+line.height+this._currPageOut.maxLineHeight) break;
                }

                if(lineMergeTo) {
                    var needRecheckMainWord=false;
                    var firstWordLine=this.getFirstWord(line);
                    var firstWordLineMerge=this.getFirstWord(lineMergeTo);
                    if(firstWordLine.x<firstWordLineMerge.x && line.maxWordHeight>=lineMergeTo.maxWordHeight-2) needRecheckMainWord=true;
                    this.mergeLine(lineMergeTo,line);
                    hasMerge=true;
                    if(needRecheckMainWord) {
                        this.recheckMainWordLine(lineMergeTo,firstWordLine.y+firstWordLine.height/2,line.maxWordHeight);
                    }
                    break;
                }
            }
            
        }while(hasMerge==true);
    }

    createLineRender(){
        for(var i=0;i<this._currPageOut.lines.length;i++){
            var line=this._currPageOut.lines[i];
            if(line.isMerge==true) continue;
            var div=document.createElement("div");
            div.style.position="absolute";
            div.style.top=line.y+"px";
            div.style.left=line.x+"px";
            div.style.width=line.width+"px";
            div.style.height=line.height+"px";
            div.setAttribute("contenteditable","true");
            div.setAttribute("lineIndex",line.lineIndex);
            div.setAttribute("minWordIndex",line.minWordIndex);
            div.setAttribute("maxWordIndex",line.maxWordIndex);
            div.setAttribute("maxFontSize",line.maxFontSize);
            div.setAttribute("minFontSize",line.minFontSize);
            div.setAttribute("groupFenceIndex",line.groupFenceIndex);
            div.setAttribute("spellcheck","false");
            if(line.maxFenceWord) div.setAttribute("maxFenceWord",line.maxFenceWord.height);
            div.setAttribute("canMergeIndex",line.canMergeIndex);
           // div.style.display="none"
            div.style.border="1px solid red";
            //if(line.maxFenceWord && Math) div.style.border="1px solid red";

           // if(line.groupFenceIndex>=0) {
           //     this.log(line);
           //     div.style.border="1px solid red";
            //}
            
            for(var j=0;j<line.wordsMerge.length;j++){
                var currWord=line.wordsMerge[j];
                var currSpan=document.createElement("span");
                currSpan.style.position="absolute";
                currSpan.style.fontFamily=currWord.fontFamily;
                currSpan.style.fontSize=currWord.fontSize
                currSpan.style.color=currWord.color;
                currSpan.setAttribute("whiteWidth",currWord.whiteWidth);
                currSpan.setAttribute("wordIndex",currWord.wordIndex);
                currSpan.setAttribute("lineIndex",currWord.originLine.lineIndex);
                currSpan.setAttribute("isFenceChar",currWord.isFenceChar);
                currSpan.setAttribute("isSpecialChar",currWord.isSpecialChar);
                currSpan.setAttribute("isRealFontSize",currWord.isRealFontSize);
                currSpan.setAttribute("groupFenceIndex",currWord.groupFenceIndex);
                currSpan.setAttribute("realFontSize",currWord.realFontSize);
                currSpan.setAttribute("scaleY",currWord.scaleY);
                currSpan.setAttribute("width",currWord.width);
                currSpan.setAttribute("height",currWord.height);
                currSpan.setAttribute("cheight",currWord.cheight);
                currSpan.setAttribute("y",currWord.y);
                currSpan.setAttribute("cy",currWord.cy);
                currSpan.setAttribute("carr",currWord.c);
                currSpan.style.transformOrigin="0% 0%";
                currSpan.style.whiteSpace="nowrap";
                currSpan.style.top=(currWord.cy-line.y)+"px";
                currSpan.style.left=(currWord.x-line.x)+"px";


                if(line.words.indexOf(currWord)>=0)  {
                    //currSpan.style.border="1px solid green";
                    currSpan.setAttribute("mainWord",true);
                    currSpan.style.backgroundColor="#FF00001F";
                }

                if(currWord.isSpecialCanOverWord==true){
                    currSpan.style.backgroundColor="#00FF001F";
                }

                //if(currWord==line.wordsMerge[line.wordsMerge.length-1]) currSpan.style.border="1px solid green";
                //if(currWord.isBlockSmallOverlap==true) currSpan.style.border="1px solid green";
                //if(currWord.isBlockWordSmallOverlap==true) currSpan.style.border="1px solid blue";
                //if(currWord.fenceIndex>0) currSpan.style.border="1px solid red";
                //currSpan.setAttribute("text-transform",currWord.textTransform);
                //currSpan.style.transform=(currWord.skewX!=0 || currWord.skewY!=0)? "matrix("+currWord.scaleX+","+currWord.skewX+","+currWord.skewY+","+currWord.scaleY+",0,0)":"scale("+Math.abs(currWord.scaleX)+","+Math.abs(currWord.scaleY)+")";
                //if(line.groupFenceIndex>=0){
                //    if(line.words.indexOf(currWord)>=0)  currSpan.style.border="1px solid green";
                //}
                
                //if(line.firstNormalWord==currWord)  currSpan.style.border="1px solid green";
                currSpan.innerHTML=currWord.t;
             //   document.body.appendChild(currSpan);

              //  var box=currSpan.getBoundingClientRect();
              //  var scx=currWord.width/box.width;
              //  var scy=currWord.cheight/box.height;
                currSpan.style.transform="scale("+Math.abs(currWord.scaleX)+","+Math.abs(currWord.scaleY)+")";
                //document.body.removeChild(currSpan);
                div.appendChild(currSpan);
               // if(currWord.isSpecialChar && currWord.c=="="){
               //     this.drawDivToCanvas(currSpan);
               // }
            }

           for(var j=0;j<line.lineFracs.length;j++){
                var frac=line.lineFracs[j];
                var fra=document.createElement("div");
                fra.style.position="absolute";
                fra.style.width=frac.width+"px";
                fra.style.height=line.height+"px";
                fra.style.top="0px";//(frac.y-line.y)+"px";
                fra.style.left=(frac.x-line.x)+"px";
                fra.style.border="1px solid blue";
                
                div.appendChild(fra);
            }

           this._currPageOut.divElement.push(div);
        }
    }
    createBorder(rect,color){
        this.log(rect);
        var div=document.createElement("div");
        div.style.position="absolute";
        div.style.transformOrigin="0% 0%";
        div.style.width=rect.width+"px";
        div.style.height=rect.height+"px";
        div.style.left=rect.x+"px";
        div.style.top=rect.y+"px";
        div.style.border="1px solid "+color;
        document.body.appendChild(div);
    }
    async createImage(node){
        return new Promise((resolve)=>{
            var divImg=document.createElement("div");
            divImg.style.position="absolute";
            divImg.style.overflow="hidden";
            divImg.style.transformOrigin="0% 0%";
            document.body.appendChild(divImg);
    
            var img=new Image();
            img.style.position="absolute";
            img.style.transformOrigin="0% 0%";
            divImg.appendChild(img);
    
            img.onload=()=>{
                if(node.getAttribute('text-transform')){
                    var text_transform=node.getAttribute('text-transform');
                    img.style.transform=this.transformSvgToCss(text_transform);
                    var box=node.getBoundingClientRect();
                    var imgBox=img.getBoundingClientRect();
                    img.style.top=-imgBox.y+"px";
                    img.style.left=-imgBox.x+"px";
                    divImg.style.width=imgBox.width+"px";
                    divImg.style.height=imgBox.height+"px";
                    divImg.style.transform="translate("+box.x+"px,"+box.y+"px)";
                }
                this.createImageClippath(divImg,node);
                document.body.removeChild(divImg);
                resolve(divImg);
            }
            img.onerror=()=>{
                resolve(null);
            }
            img.src=node.getAttribute("xlink:href");   
        })   
    }
    createImageClippath(divImg,node){
       var clipPath=node.getAttribute("text-clippath");
       if(clipPath){
            clipPath.split(" ").forEach(id=>{
                var divClipPath=document.getElementById(id);
                if(divClipPath){
                    var oldTransform=divClipPath.firstChild.getAttribute("transform");
                    divClipPath.firstChild.setAttribute("transform",this._pageRender.svg.childNodes[1].getAttribute("transform")+" "+divClipPath.getAttribute("transform"));
                    var boxClipPath=divClipPath.getBoundingClientRect();
                    var box=node.getBoundingClientRect();
                    divImg.style.width=boxClipPath.width+"px";
                    divImg.style.height=boxClipPath.height+"px";
                    divImg.style.transform="translate("+boxClipPath.x+"px,"+boxClipPath.y+"px)";
                    divImg.firstChild.style.top=parseInt(divImg.firstChild.style.top)-(boxClipPath.y-box.y)+"px";
                    divImg.firstChild.style.left=parseInt(divImg.firstChild.style.left)-(boxClipPath.x-box.x)+"px";
                    if(oldTransform) divClipPath.firstChild.setAttribute("transform",oldTransform);
                }
                
            })
       }
    }
    createSvg(node,nodePath){
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.position="absolute";
        svg.style.top="0px";
        svg.style.left='0px';
        svg.style.transformOrigin="0% 0%";
        var svgG=document.createElementNS("http://www.w3.org/2000/svg", "g");
        var text_transform=node.getAttribute('text-transform');
        text_transform=this.transformSvgToCss(text_transform);
        svgG.style.transform=text_transform;
        svg.appendChild(svgG);
        
        var minx=Number.MAX_SAFE_INTEGER;
        var miny=Number.MAX_SAFE_INTEGER;
        var maxx=0;
        var maxy=0;
        nodePath.forEach(path=>{

            var boxPath=path.getBoundingClientRect();
            minx=(minx>boxPath.x)? boxPath.x:minx;
            miny=(miny>boxPath.y)? boxPath.y:miny;
            maxx=(maxx<boxPath.x+boxPath.width)? boxPath.x+boxPath.width:maxx;
            maxy=(maxy<boxPath.y+boxPath.height)? boxPath.y+boxPath.height:maxy;

            var p=document.createElementNS("http://www.w3.org/2000/svg", "path");
            var attr = path.attributes;
            for (var key in attr) {
                if(attr[key].name && attr[key].nodeValue){
                    p.setAttribute(attr[key].name,attr[key].nodeValue);
                }
            }
            svgG.appendChild(p);

            //check path is fracs
            if(boxPath.height<5 && boxPath.width>2*boxPath.height){
                this._currPageOut.lineFracs.push({
                    x:boxPath.x,
                    y:boxPath.y,
                    width:boxPath.width,
                    height:boxPath.height
                });
            }
        })

        minx=(minx==Number.MAX_SAFE_INTEGER)? maxx:minx;
        miny=(miny==Number.MAX_SAFE_INTEGER)? maxy:miny;

        var width=Math.round(maxx-minx);
        var height=Math.round(maxy-miny);

        minx=Math.round(2-minx);
        miny=Math.round(2-miny);

        width+=4;
        height+=4;

        /*if(width<3){
            width=3;
            //minx+=2;
        }
        if(height<3){
            height=3;
            //miny+=2;
        }*/
        svgG.style.transform="translate("+(minx)+"px,"+(miny)+"px)"+svgG.style.transform;
        

        svg.setAttribute("width",width);        
        svg.setAttribute("height",height);
        svg.style.transformOrigin="0% 0%";

        svg.style.top=(-(miny))+"px";
        svg.style.left=(-(minx))+"px";

        return svg;
    }
    transformSvgToCss(svgTransform){
        svgTransform=svgTransform.replaceAll(" ",",").replaceAll("_"," ");
        var svgTransforms=svgTransform.split(" ");
        var svgTransform="";
        svgTransforms.forEach(trans=>{
            if(trans.indexOf("translate")>=0){
                trans=trans.replaceAll(",","px,").replaceAll(")","px)");
            }
            svgTransform+=trans+" ";
        })
        return svgTransform;
    }
    getRotateFromTransform(matrix) 
    {     
        let angle = 0; 
        if (matrix) 
        {
            const values = matrix.split('(')[1].split(')')[0].split(',');
            const a = values[0];
            const b = values[1];
            angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
        } 
        return (angle < 0) ? angle +=360 : angle;
    }
    getScaleFromTransform(svgTransform){
        var sc={
            scaleX:1,
            scaleY:1,
            skewX:0,
            skewY:0,
        }
        var svgTransforms=svgTransform.split(" ");
        svgTransforms.forEach(trans=>{
            if(trans.indexOf("matrix")>=0){
                trans=trans.replaceAll("matrix(","").replaceAll(")","").split(",");
                if(!isNaN(Number(trans[0])) && Number(trans[0])!=0) sc.scaleX*=Number(trans[0]);
                if(!isNaN(Number(trans[1])) && Number(trans[1])!=0) sc.skewX+=Number(trans[1]);
                if(!isNaN(Number(trans[2])) && Number(trans[2])!=0) sc.skewY+=Number(trans[2]);
                if(!isNaN(Number(trans[3])) && Number(trans[3])!=0) sc.scaleY*=Number(trans[3]);
            }
            if(trans.indexOf("scale")>=0){
                trans=trans.replaceAll("scale(","").replaceAll(")","").split(",");
                if(!isNaN(Number(trans[0])) && Number(trans[0])!=0) sc.scaleX*=Number(trans[0]);
                if(!isNaN(Number(trans[1])) && Number(trans[1])!=0) sc.scaleY*=Number(trans[1]);
            }
            if(trans.indexOf("scaleX")>=0){
                trans=trans.replaceAll("scale(","").replaceAll(")","").split(",");
                if(!isNaN(Number(trans[0])) && Number(trans[0])!=0) sc.scaleX*=Number(trans[0]);
            }
            if(trans.indexOf("scaleY")>=0){
                trans=trans.replaceAll("scale(","").replaceAll(")","").split(",");
                if(!isNaN(Number(trans[0])) && Number(trans[0])!=0) sc.scaleY*=Number(trans[0]);
            }
        })

        return sc;
    }
    _calRealHeightByPixel(node,boxNode,sc){

        var fontFamily=node.getAttribute("font-family");
        var fontSize=node.getAttribute("font-size");
       
        var width=boxNode.width;//Math.floor(3*boxNode.width*Math.abs(sc.scaleX));
        var height=boxNode.height;//Math.floor(2*boxNode.height*Math.abs(sc.scaleY));
        
        boxNode.cy=boxNode.y;
        boxNode.cheight=boxNode.height;

        //if(boxNode.width<=0 || boxNode.height<=0) return;

        var cv=document.createElement("canvas");
        cv.width=width;
        cv.height=height;
        var ctx=cv.getContext("2d");
        var strFont=Math.round(Number.parseFloat(fontSize))*Math.abs(sc.scaleY)+"px "+fontFamily;
        ctx.font=strFont;
        let metrics = ctx.measureText(node.innerHTML);
        boxNode.height=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
        boxNode.y=boxNode.y+(metrics.fontBoundingBoxAscent-metrics.actualBoundingBoxAscent);

        boxNode.height=(boxNode.height<3) ? 3:boxNode.height;
        return ;
    }
    
    isOverlapWordIndex(line1,line2){
        if(line1.minWordIndex>line2.minWordIndex && line1.minWordIndex<line2.maxWordIndex) return true;
        if(line1.maxWordIndex>line2.minWordIndex && line1.maxWordIndex<line2.maxWordIndex) return true;
        if(line2.minWordIndex>line1.minWordIndex && line2.minWordIndex<line1.maxWordIndex) return true;
        if(line2.maxWordIndex>line1.minWordIndex && line2.maxWordIndex<line1.maxWordIndex) return true;
        return false;
    }
    isOverlapY(line1,line2){
        if(line1.y+line1.height<line2.y-1
            || line2.y+line2.height<line1.y-1) return false
        return true;    
    }
    isOverlapX(block1,block2){
        var overlapX=this.getDistanceX(block1,block2);
        return (overlapX<0 && (Math.abs(overlapX)>4|| Math.abs(overlapX)>=Math.min(block1.width,block2.width)-1))
    }
    isFenceLine(line){
        if(line.maxFenceWord) return true;
        if(line.groupFenceIndex>-1) return true;
        return false;
    }
    isSpecialChar(unicode){
        for(var i=0;i<unicode.length;i++){
            var isSpecial=(unicode[i].charCodeAt(0)>=7930 || this.SPECIAL_CHAR.indexOf(unicode[i])>=0)? true:false;
            if(!isSpecial) return false;
        }
        return true;
    }
    isRealFontSize(node){
        if(fontSize*Math.abs(sc.scaleY)+5<boxNode.height
        ||(carr && this.isFenceChar(carr[0]))) return false
        return true;
    }
    isFenceChar(unicode){
        var chars="∣|{}()[]";
        if(chars.indexOf(unicode)>=0) return true;
        return false;
    }
    isPartialFenceChar(carr){
        var chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-¯−=+><·∫ ";
        for(var i=0;i<carr.length;i++){
            if(chars.indexOf(carr[i])>=0) return false;
        }
        return true;
    }
    isSpecialArrowChar(wo){
        return (wo.isSpecialChar && wo.width>16 && (wo.width>4*wo.height || (wo.height<5 && wo.width>2.2*wo.height)))? true:false ;//case arrow text in middle 
    }
    isSpecialCanOverWord(wo){
        if(wo.c.length>1) return false; // has one character
        if(wo.groupFenceIndex>=0) return false; //

        var line=wo.currLine;
        var idx=line.words.indexOf(wo);

        if(idx<0) return false;
        var preWo=(idx==0)? null:line.words[idx-1];
        var nextWo=(idx==line.words.length-1)? null:line.words[line.words.length+1];

        if(!preWo && !nextWo) {
            if(wo.height>1.2*wo.width) return true;
            return false;
        }else{
           // this.log("check special char ; "+wo.cheight+":"+preWo.cheight+":"+nextWo.cheight);
            if(preWo){
                if(wo.cheight<1.4*preWo.cheight) return false;
            }
            if(nextWo){
                if(wo.cheight>1.4*nextWo.cheight) return false;
            }
            return true;
        }

       // if(wo.cheight>1.2*wo.currLine.maxWordHeight && wo.c.length==1) return true;
       // if(wo.c.length==1 && wo.cheight>=wo.currLine.maxWordHeight && wo.height>2.5*wo.width) return true;
        return false;
    }
    isSpecialSqrtChar(wo){
        if(wo.isRealFontSize==false && wo.height>2*wo.realFontSize && wo.height>2*wo.width) return true;
        return false;
    }
    getFirstWord(line){
        //if(line.firstNormalWord) return line.firstNormalWord;
        //else {
            if(line.words.length>0) return line.words[0]
            else if(line.wordsMerge.length>0) return line.wordsMerge[0]
        //    else {
        //        //strange line no have any word imposible
        //    }
        //}
    }
    getDistanceLineNotOverlap(line1,line2){
        if(line1.y<line2.y){
            return line2.y-(line1.y+line1.height)
        }else{
            return line1.y-(line2.y+line2.height)
        }
    }
    getDistanceX(block1,block2){
        if(block1.x+block1.width<block2.x) return block2.x-(block1.x+block1.width) //positive
        else{
            if(block1.x<block2.x) return block2.x-(block1.x+block1.width) // native
            else {
                 if(block1.x+block1.width<block2.x+block2.width) return -(block1.width) // native include 
                 else {
                    if(block1.x<block2.x+block2.width) return -(block2.x+block2.width-block1.x) // native
                    else return block1.x-(block2.x+block2.width) // positive
                 }
            }
        }
    }
    getDistanceY(block1,block2){
        if(block1.y+block1.height<block2.y) return block2.y-(block1.y+block1.height) // positive
        else{
            if(block1.y<block2.y) return block2.y-(block1.y+block1.height) //native
            else{
                if(block1.y+block1.height<block2.y+block2.height) return -(block1.height) //native
                else{
                    if(block1.y<block2.y+block2.height) return -(block2.y+block2.height-block1.y) //native
                    else return block1.y-(block2.y+block2.height) // positive
                }
            }
        }
    }
    mergeRect(rect,rectMerge){
        var minx=Math.min(rect.x,rectMerge.x);
        var maxx=Math.max(rect.x+rect.width,rectMerge.x+rectMerge.width);
        var miny=Math.min(rect.y,rectMerge.y);
        var maxy=Math.max(rect.y+rect.height,rectMerge.y+rectMerge.height);
        rect.x=minx;rect.y=miny;
        rect.width=maxx-minx;
        rect.height=maxy-miny;
    }
    //#endregion
}