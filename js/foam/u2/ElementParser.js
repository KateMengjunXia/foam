/**
 * @license
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

CLASS({
  package: 'foam.u2',
  name: 'ElementParser',

  onLoad: function() {
    this.parser__ = {
      __proto__: grammar,

      create: function() {
        return { __proto__: this }.reset();
      },

      out: function(s) { this.output.push.apply(this.output, arguments); },

      reset: function() {
        this.output = [];
        this.stack  = [];
        return this;
      },

      peek: function() { return this.stack[this.stack.length-1]; },

      START: sym('html'),

      html: repeat0(sym('htmlPart')),

      // Use simpleAlt() because endTag() doesn't always look ahead and will
      // break the regular alt().
      htmlPart: simpleAlt(
        sym('cdata'),
        sym('code'),
        sym('comment'),
        sym('text'),
        sym('endTag'),
        sym('startTag')),

      tag: seq(
        sym('startTag'),
        repeat(seq1(1, sym('matchingHTML'), sym('htmlPart')))),

      matchingHTML: function(ps) {
        return this.stack.length > 1 ? ps : null;
      },

    code: seq('<%', repeat(not('%>', anyChar)), '%>'),

/*
      startTag: seq(
        '<',
        sym('tagName'),
        sym('whitespace'),
        sym('attributes'),
        sym('whitespace'),
        optional('/'),
        '>'),
*/
      startTag: seq(
        '<',
        sym('startTagName'),
//        sym('whitespace'),
//        repeat0(sym('tagPart'), sym('whitespace')),
//        sym('whitespace'),
        optional('/'),
        '>'),

      endTag: (function() {
        var endTag_ = sym('endTag_');
        return function(ps) {
          return this.stack.length > 1 ? this.parse(endTag_, ps) : undefined;
        };
      })(),

      endTag_: seq1(1, '</', sym('tagName'), '>'),

      tagPart: alt(
        sym('id'),
        sym('attribute'),
        sym('style'),
        sym('listener')
      ),

      cdata: seq1(1, '<![CDATA[', str(repeat(not(']]>', anyChar))), ']]>'),

      comment: seq('<!--', repeat0(not('-->', anyChar)), '-->'),

      label: str(plus(notChars(' %=/\t\r\n<>\'"'))),

      tagName: sym('label'),

      startTagName: sym('tagName'),

      text: str(plus(alt('<%', notChar('<')))),

      attribute: seq(sym('label'), optional(seq1(1, '=', sym('value')))),

      id: seq('id="', sym('value'), '"'),

      value: str(alt(
        plus(alt(range('a','z'), range('A', 'Z'), range('0', '9'))),
        seq1(1, '"', repeat(notChar('"')), '"')
      )),

      whitespace: repeat0(alt(' ', '\t', '\r', '\n'))
    }.addActions({
      START: function(xs) {
        var ret = this.output.join('');
        this.reset();
        return 'var E=this.E.bind(this),s=[],e=' + ret + ';return e;';
      },
      tag: function(xs) {
        var ret = this.stack[0];
        this.stack = [ X.foam.u2.Element.create() ];
        return ret.childNodes[0];
      },
      tagName: function(n) { return n.toUpperCase(); },
      attribute: function(xs) { return { name: xs[0], value: xs[1] }; },
      // Do we need this?
      cdata: function(xs) { this.peek() && this.peek().appendChild(xs); },
      text: function(xs) {
        // TODO: don't strip whitespace for <pre>
        this.out(".a('", xs.replace(/\s+/g, ' '), "')");
      },
      code: function (v) {
        this.out(".s(s);", v[1].join('').trim(), "s[0]");
      },
      startTagName: function(xs) {
        if ( this.stack.length ) this.out('.a(');
        if ( xs === 'SPAN' )
          this.out("E()");
        else
          this.out("E('", xs, "')");
        this.stack.push(xs);
      },
      endTag: function(tag) {
        var stack = this.stack;

        while ( stack.length > 1 ) {
          if ( this.peek() === tag ) {
            stack.pop();
            this.out(')');
            return;
          }
          /*
          var top = stack.pop();
          this.peek().childNodes = this.peek().childNodes.concat(top.childNodes);
          top.childNodes = [];
          */
        }
      }
    });
  }
});