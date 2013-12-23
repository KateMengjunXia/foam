/**
 * @license
 * Copyright 2013 Google Inc. All Rights Reserved.
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
function KeyboardShortcutController(win, view) {
  this.contexts_ = {};
  this.body_ = {};

  this.processView_(view);

  win.addEventListener('keydown', this.processKey_.bind(this));
}

KeyboardShortcutController.prototype.processView_ = function(view) {
  var keyShortcuts = view.shortcuts;
  if (keyShortcuts) {
    keyShortcuts.forEach(function(nav) {
      var key = nav[0];
      var cb = nav[1];
      var context = nav[2];
      this.addAccelerator(key, cb, context);
    }.bind(this));
  }

  try {
    var children = view.children;
    children.forEach(this.processView_.bind(this));
  } catch(e) { console.log(e); }
};

KeyboardShortcutController.prototype.addAccelerator = function(key,
                                                               callback,
                                                               context) {
  if (context) {
    if (typeof(context) != 'string')
      throw "Context must be an identifier for a DOM node.";
    if (!(context in this.contexts_))
      this.contexts_[context] = {};

    this.contexts_[context][key] = callback;
  } else {
    this.body_[key] = callback;
  }
};

KeyboardShortcutController.prototype.shouldIgnoreKeyEventsForTarget_ = function(event) {
  var target = event.target;
  if (target.isContentEditable)
    return true;
  return target.tagName == 'INPUT' ||
         target.tagName == 'TEXTAREA';
};

KeyboardShortcutController.prototype.processKey_ = function(event) {
  if (this.shouldIgnoreKeyEventsForTarget_(event))
    return;

  for (var node = event.target; node && node != document.body; node =
       node.parentNode) {
    var id = node.id;
    if (id && (id in this.contexts_)) {
      var cbs =  this.contexts_[id];
      if (event.keyIdentifier in cbs) {
        var cb = cbs[event.keyIdentifier];
        cb(event);
        event.preventDefault();
        return;
      }
    }
  }
  console.log('Looking for ' + event.keyIdentifier);
  if (event.keyIdentifier in this.body_) {
    var cb = this.body_[event.keyIdentifier];
    cb(event);
    event.preventDefault();
  }
};


var SimpleValue = Model.create({
  name: 'SimpleValue',

  properties: [ { name: 'value' } ],

  methods: {
    init: function(value) { this.value = value || ""; },
    get: function() { return this.value; },
    set: function(val) { this.value = val; },
    toString: function() { return "SimpleValue(" + this.value + ")"; }
  }
});


var DOM = {
  setClass: function(e, className, opt_enabled) {
    var oldClassName = e.className || '';
    var enabled = opt_enabled === undefined ? true : opt_enabled;
    e.className = oldClassName.replace(' ' + className, '').replace(className, '');
    if ( enabled ) e.className = e.className + ' ' + className;
  }
};

function toNum(p) { return p.replace ? parseInt(p.replace('px','')) : p; };


// ??? Should this have a 'value'?
// Or maybe a ValueView and ModelView
var AbstractView = FOAM({
   model_: 'Model',

   name: 'AbstractView',
   label: 'AbstractView',

   properties: [
      {
         name:  'elementId',
         label: 'Element ID',
         type:  'String'
      },
      {
         name:  'parent',
         type:  'View',
         hidden: true
      },
      {
         name:  'children',
         type:  'Array[View]',
         valueFactory: function() { return []; }
      },
      {
        name:   'shortcuts',
        type:   'Array[Shortcut]',
        valueFactory: function() { return []; }
      },
      {
        name:   '$',
        mode:   "read-only",
        getter: function() { return $(this.getID()); },
        help:   'DOM Element.'
      }
   ],

   methods: {
    strToHTML: function(str) {
      return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    addChild: function(child) {
      child.parent = this;

      var children = this.children;
      children.push(child);
      this.children = children;

      return this;
    },

    removeChild: function(child) {
      this.children.remove(child);
      child.parent = undefined;

      return this;
    },

    addChildren: function() {
      Array.prototype.forEach.call(arguments, this.addChild.bind(this));

      return this;
    },

    addShortcut: function(key, callback, context) {
      this.shortcuts.push([key, callback, context]);
    },

    // TODO: make use new static_ scope when available
    nextID: function() {
      return "view" + (arguments.callee._nextId = (arguments.callee._nextId || 0) + 1);
    },

    getID: function() {
      // @return this View's unique DOM element-id
// console.log('getID', this.elementId);
      if ( this.elementId ) return this.elementId;
      return this.elementId || ( this.elementId = this.nextID() );
    },

    registerCallback: function(event, listener, opt_elementId) {
        opt_elementId = opt_elementId || this.nextID();

//      if ( ! this.hasOwnProperty('callbacks_') ) this.callbacks_ = [];
        if ( ! this.callbacks_ ) this.callbacks_ = [];

        this.callbacks_.push([opt_elementId, event, listener]);

        return opt_elementId;
    },

    /** Insert this View's toHTML into the Element of the supplied name. **/
    insertInElement: function(name) {
      var e = $(name);
      e.innerHTML = this.toHTML();
      this.initHTML();
    },

    write: function(document) {
       // Write the View's HTML to the provided document and then initialize.

       document.writeln(this.toHTML());
       this.initHTML();
    },

     initHTML: function() {
       // Initialize this View and all of it's children.
       // This mostly involves attaching listeners.
       // Must be called activate a view after it has been added to the DOM.

       this.registerCallbacks();
       this.initChildren();
     },

     initChildren: function() {
       if ( this.children ) {
         // init children
         for ( var i = 0 ; i < this.children.length ; i++ ) {
           // console.log("init child: " + this.children[i]);
           try {
             this.children[i].initHTML();
           } catch (x) {
             console.log("Error on AbstractView.child.initHTML", x, x.stack);
           }
         }
       }
     },

     registerCallbacks: function() {
       if ( this.callbacks_ ) {
         // hookup event listeners
         for ( var i = 0 ; i < this.callbacks_.length ; i++ ) {
           var callback  = this.callbacks_[i];
           var elementId = callback[0];
           var event     = callback[1];
           var listener  = callback[2];
           var e         = $(elementId);
           if ( ! e ) {
             console.log('Error Missing element for id: ' + elementId + ' on event ' + event);
           } else {
             e.addEventListener(event, listener.bind(this), false);
           }
         }

         delete this['callbacks_'];
       }
     }

   }

});


var DomValue = {
   DEFAULT_EVENT:    'change',
   DEFAULT_PROPERTY: 'value',

   create: function(element, opt_event, opt_property) {
      if ( ! element ) {
         throw "Missing Element in DomValue";
      }

      return {
         __proto__: this,
         element:   element,
         event:     opt_event    || this.DEFAULT_EVENT,
         property:  opt_property || this.DEFAULT_PROPERTY };
   },

   setElement: function ( element ) { this.element = element; },

   get: function() { return this.element[this.property]; },

   set: function(value) {
     if ( this.element[this.property] != value )
       this.element[this.property] = value;
   },

   addListener: function(listener) {
      if ( ! this.event ) return;
      try {
         this.element.addEventListener(this.event, listener, false);
      } catch (x) {
      }
   },

   removeListener: function(listener) {
      if ( ! this.event ) return;
      try {
         this.element.removeEventListener(this.event, listener, false);
      } catch (x) {
         // could be that the element has been removed
      }
   },

   toString: function() {
      return "DomValue(" + this.event + ", " + this.property + ")";
   }
};



var ImageView = FOAM({
   model_: 'Model',

   extendsModel: 'AbstractView',

   properties: [
      {
         name: 'value',
         valueFactory: function() { return SimpleValue.create(); },
         postSet: function(newValue, oldValue) {
            oldValue && Events.unfollow(oldValue, this.domValue);
            Events.follow(newValue, this.domValue);
         }
      },
      {
         name: 'domValue',
         postSet: function(newValue, oldValue) {
            oldValue && Events.unfollow(this.value, oldValue);
            Events.follow(this.value, newValue);
         }
      },
      {
         name: 'placeHolder',
         postSet: function(newValue) {
            if ( this.$ ) {
               this.$.children[0].style.backgroundImage = newValue;
            }
         }
      },
      {
         name: 'displayWidth',
         postSet: function(newValue) {
            if ( this.$ ) {
               this.$.style.width = newValue;
            }
         }
      },
      {
         name: 'displayHeight',
         postSet: function(newValue) {
            if ( this.$ ) {
               this.$.style.height = newValue;
            }
         }
      }
   ],

   methods: {
      setValue: function(value) {
         this.value = value;
      },
      toHTML: function() {
         return '<div class="imageViewContainer" id="' + this.getID() + '"><div class="imageView"></div>' +
            '<img class="imageView" id="' + this.registerCallback('load', this.onLoad) + '"></div>';
      },
      initHTML: function() {
         this.SUPER();
         this.displayWidth = this.displayWidth;
         this.displayHeight = this.displayHeight;
         this.$.children[1].style.opacity = 0;
         this.domValue = DomValue.create(this.$.children[1], undefined, 'src');
      }
   },

   listeners: [
      {
         name: 'onLoad',
         code: function() {
            this.$.children[0].style.opacity = 0;
            this.$.children[1].style.opacity = 0.99;
         }
      }
   ]
});

var BlobImageView = FOAM({
  model_: 'Model',

  extendsModel: 'AbstractView',

  name: 'BlobImageView',
  help: 'Image view for rendering a blob as an image.',

  properties: [
    {
      name: 'value',
      valueFactory: function() { return SimpleValue.create(); },
      postSet: function(newValue, oldValue) {
        oldValue && oldValue.removeListener(this.onValueChange);
        newValue.addListener(this.onValueChange);
      }
    },
    {
      model_: 'IntegerProperty',
      name: 'displayWidth'
    },
    {
      model_: 'IntegerProperty',
      name: 'displayHeight'
    }
  ],

  methods: {
    setValue: function(value) {
      this.value = value;
    },

    toHTML: function() {
      return '<img id="' + this.getID() + '">';
    },

    initHTML: function() {
      this.SUPER();
      var self = this;
      this.$.style.width = self.displayWidth;
      this.$.style.height = self.displayHeight;
      this.onValueChange();
    }
  },

  listeners: [
    {
      name: 'onValueChange',
      code: function() {
        if ( ! this.value.get() ) return;
        if ( this.$ )
          this.$.src = URL.createObjectURL(this.value.get());
      }
    }
  ]
});


var Label = FOAM({

   model_: 'Model',

   name:  'Label',

   properties: [
      {
         name:  'parent',
         type:  'CView',
         hidden: true
      },
      {
         name:  'text',
         type:  'String',
         defaultValue: ''
      },
      {
         name:  'align',
         label: 'Alignment',
         type:  'String',
         defaultValue: 'start' // values: left, right, center, start, end
      },
      {
         name:  'font',
         type:  'String',
         defaultValue: ''
      },
      {
         name:  'color',
         type:  'String',
         defaultValue: 'black'
      },
      {
         name:  'x',
         type:  'int',
         defaultValue: 100
      },
      {
         name:  'y',
         type:  'int',
         defaultValue: 100
      },
      {
         name:  'maxWidth',
         label: 'Maximum Width',
         type:  'int',
         defaultValue: -1
      }
   ],

   methods: {
      paint: function() {
         var canvas = this.parent.canvas;
         var oldFont = canvas.font;
         var oldAlign = canvas.textAlign;

         if ( this.font ) canvas.font = this.font;

         canvas.textAlign = this.align;
         canvas.fillStyle = this.color;
         canvas.fillText(this.text, this.x, this.y);

         canvas.font = oldFont;
         canvas.textAlign = oldAlign;
      }
   }
});


var Box = FOAM({

   model_: 'Model',

   extendsModel: 'Label',

   name:  'Box',

   properties: [
      {
         name:  'background',
         label: 'Background Color',
         type:  'String',
         defaultValue: 'white'
      },
      {
         name:  'border',
         label: 'Border Color',
         type:  'String',
         defaultValue: 'black'
      },
      {
         name:  'a',
         label: 'Angle',
         type:  'int',
         defaultValue: 0
      },
      {
         name:  'width',
         type:  'int',
         defaultValue: 100
      },
      {
         name:  'height',
         type:  'int',
         defaultValue: 100
      }
   ],

   methods: {
      paint: function() {
        var c = this.parent.canvas;

        c.save();

        if ( this.a ) {
          c.translate(this.x+this.width/2, this.y+this.height/2);
          c.rotate(this.a);
          c.translate(-this.x-this.width/2, -this.y-this.height/2);
        }

        c.fillStyle = this.background;
        c.fillRect(this.x, this.y, this.width, this.height);

        if ( this.border && this.width && this.height ) {
          c.strokeStyle = this.border;
          c.strokeRect(this.x, this.y, this.width, this.height);
        }

        var oldFont = c.font;
        var oldAlign = c.textAlign;

        if ( this.font ) c.font = this.font;

        c.textAlign = 'center'; //this.align;
        c.fillStyle = this.color;
        c.fillText(
          this.text,
          this.x + this.width/2,
          this.y+this.height/2+10);

        c.font = oldFont;
        c.textAlign = oldAlign;

        var grad = c.createLinearGradient(this.x, this.y, this.x+this.width, this.y+this.height);

        grad.addColorStop(  0, 'rgba(0,0,0,0.35)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(  1, 'rgba(255,255,255,0.45)');
        c.fillStyle = grad;
        c.fillRect(this.x, this.y, this.width, this.height);

        c.restore();
      }
   }
});


var TextFieldView = FOAM({

   model_: 'Model',
   name:  'TextFieldView',
   label: 'Text Field',

   extendsModel: 'AbstractView',

   properties: [
      {
         name:  'name',
         type:  'String',
         defaultValue: 'field'
      },
      {
         name:  'displayWidth',
         type:  'int',
         defaultValue: 30
      },
      {
         mode_: 'StringProperty',
         name:  'type',
         defaultValue: 'text'
      },
      {
         mode_: 'StringProperty',
         name:  'placeholder',
         defaultValue: undefined
      },
      {
         mode_: 'BooleanProperty',
         name:  'onKeyMode',
         help: 'If true, value is updated on each keystroke.'
      },
      {
         mode_: 'BooleanProperty',
         name:  'escapeHTML',
         help: 'If true, HTML content is excaped in display mode.'
      },
      {
         name:  'mode',
         type:  'String',
         defaultValue: 'read-write',
         view: {
              create: function() { return ChoiceView.create({choices:[
                 "read-only", "read-write", "final"
              ]}); } }
      },
      {
        name: 'softValue',
        valueFactory: function() { return SimpleValue.create(); },
        postSet: function(newValue, oldValue) {
          if ( this.mode === 'read-write' ) {
            Events.unlink(oldValue, this.domValue);
            Events.relate(newValue, this.domValue, this.valueToText, this.textToValue);
          } else {
            Events.unfollow(oldValue, this.domValue);
            Events.map(newValue, this.domValue, this.valueToText);
          }
        }
      },
      {
        name: 'domValue'
      },
      {
         name:  'value',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); },
         postSet: function(newValue, oldValue) {
           if ( this.onKeyMode ) {
             Events.unlink(oldValue, this.softValue);
             Events.link(newValue, this.softValue);
           } else {
             Events.unfollow(oldValue, this.softValue);
             Events.follow(newValue, this.softValue);
           }
         }
      }
   ],

   methods: {
    toHTML: function() {
      if ( this.mode === 'read-write' ) {
        this.registerCallback('change', this.onChange, this.getID());

        return '<input id="' + this.getID() + '" type="' + this.type + '" name="' + this.name + '" size=' + this.displayWidth + '/>';
      }

      return '<span id="' + this.getID() + '" name="' + this.name + '"></span>';
    },

    // TODO: deprecate
    getValue: function() { return this.value; },

    // TODO: deprecate
    setValue: function(value) {
      this.value = value;
    },

    initHTML: function() {
      this.SUPER();

      if ( this.placeholder ) this.$.placeholder = this.placeholder;

      if ( this.mode === 'read-write' ) {
        this.domValue = DomValue.create(this.$, 'input');
      } else {
//        this.domValue = DomValue.create(this.$, 'undefined', 'textContent');
        this.domValue = DomValue.create(this.$, 'undefined', this.escapeHTML ? 'textContent' : 'innerHTML');
      }

      this.setValue(this.value);
      this.softValue = this.softValue;
    },

//    textToValue: Events.identity,

//    valueToText: Events.identity,

    textToValue: function(text) { return text;},

    valueToText: function(value) { return value;},

    destroy: function() { Events.unlink(this.domValue, this.value); }
  },

  listeners: [
    {
      name: 'onChange',
      code: function(e) {
        this.value.set(this.softValue.get());
      }
    }
  ]
});


var DateFieldView = FOAM({

   model_: 'Model',
   name:  'DateFieldView',
   label: 'Date Field',

   extendsModel: 'TextFieldView',

   properties: [
      {
         mode_: 'StringProperty',
         name:  'type',
         defaultValue: 'date'
      }
   ],

   methods: {

    initHTML: function() {
       var e = this.$;

       this.domValue = DomValue.create(e, undefined, 'valueAsDate');

       this.setValue(this.value);
    }

  }
});


var DateTimeFieldView = FOAM({

   model_: 'Model',
   name:  'DateTimeFieldView',
   label: 'Date-Time Field',

   extendsModel: 'TextFieldView',

   methods: {
    textToValue: function(text) { return new Date(text); },

    valueToText: function(value) { return value.toString(); },

    toHTML: function() {
        return ( this.mode === 'read-write' ) ?
          '<input id="' + this.getID() + '" name="' + this.name + '" size=' + this.displayWidth + '/>' :
          '<span id="' + this.getID() + '" name="' + this.name + '"></span>' ;
    }
   }
});


var HTMLView = FOAM({

   model_: 'Model',
   name:  'HTMLView',
   label: 'HTML Field',

   extendsModel: 'AbstractView',

   properties: [
      {
         name:  'name',
         type:  'String',
         defaultValue: ''
      },
      {
         model_: 'StringProperty',
         name:  'tag',
         defaultValue: 'span'
      },
      {
         name:  'value',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); },
         postSet: function(newValue, oldValue) {
           if ( this.mode === 'read-write' ) {
             Events.unlink(this.domValue, oldValue);
             Events.link(newValue, this.domValue);
           } else {
             Events.follow(newValue, this.domValue);
           }
         }
      }
   ],

   methods: {
    toHTML: function() {
       var s = '<' + this.tag + ' id="' + this.getID() + '"';
       if ( this.name ) s+= ' name="' + this.name + '"';
       s += '></' + this.tag + '>';
       return s;
    },

    // TODO: deprecate
    getValue: function() { return this.value; },

    // TODO: deprecate
    setValue: function(value) { this.value = value; },

    initHTML: function() {
       var e = this.$;

       if ( ! e ) {
          console.log('stale HTMLView');
          return;
       }
       this.domValue = DomValue.create(e,undefined,'innerHTML');
       this.setValue(this.value);
    },

    destroy: function() { Events.unlink(this.domValue, this.value); }
  }
});


var ChoiceView = FOAM({

   model_: 'Model',

   extendsModel: 'AbstractView',

/*
 * <select size="">
 *    <choice value="" selected></choice>
 * </select>
 *
 *
 */
   name:  'ChoiceView',

   properties: [
      {
         name:  'name',
         type:  'String',
         defaultValue: 'field'
      },
      {
         name:  'helpText',
         type:  'String',
         defaultValue: undefined
      },
      {
         name: 'cssClass',
         type: 'String',
         defaultValue: 'foamChoiceView'
      },
      {
         name:  'size',
         type:  'int',
         defaultValue: 1
      },
      {
         name:  'value',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); }
      },
      {
         name:  'choices',
         type:  'Array[StringField]',
         help: 'Array of choices or array of [value, label] pairs.',
         defaultValue: [],
         postSet: function() {
//           if ( this.eid_ ) this.updateHTML();
         }
      }
   ],

   methods: {
     toHTML: function() {
       return '<select id="' + this.getID() + '" name="' + this.name + '" size=' + this.size + '/></select>';
     },

     updateHTML: function() {
       var out = [];

       if ( this.helpText ) {
         out.push('<option disabled="disabled">');
         out.push(this.helpText);
         out.push('</option>');
       }

       for ( var i = 0 ; i < this.choices.length ; i++ ) {
         var choice = this.choices[i];
         var id     = this.nextID();

         try {
           this.registerCallback('click', this.onClick, id);
           this.registerCallback('mouseover', this.onMouseOver, id);
           this.registerCallback('mouseout', this.onMouseOut, id);
         } catch (x) {
           // Fails on iPad, which is okay, because this feature doesn't make
           // sense on the iPad anyway.
         }

         out.push('\t<option id="' + id + '"');

         if ( Array.isArray(choice) ) {
//           var encodedValue = choice[0].replace(/\"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
//           var encodedValue = choice[0].replace(/"/g, '*').replace(/</g, '*').replace(/>/g, '*');
           if ( this.value && choice[0] === this.value.get()[0] ) out.push(' selected');
           out.push(' value="');
           out.push(i + '">');
           out.push(choice[1].toString());
         } else {
           if ( this.value && choice == this.value.get() ) out.push(' selected');
           out.push('>');
           out.push(choice.toString());
         }
         out.push('</option>');
       }

       this.$.innerHTML = out.join('');
       AbstractView.getPrototype().initHTML.call(this);
     },

     getValue: function() {
       return this.value;
     },

     setValue: function(value) {
       Events.unlink(this.domValue, this.value);
       this.value = value;
//       Events.link(value, this.domValue);
       var self = this;
       Events.relate(
         value,
         this.domValue,
         function (v) {
           for ( var i = 0 ; i < self.choices.length ; i++ ) {
             var c = self.choices[i];
             if ( Array.isArray(c) ) {
               if ( c[0] === v ) return i;
             } else {
               if ( v == c ) return v;
             }
           }
           return v;
         },
         function (v) { return self.indexToValue(v); }
       );
     },

     initHTML: function() {
       var e = this.$;

       Events.dynamic(function() { this.choices; }.bind(this), this.updateHTML.bind(this));

       this.updateHTML();

       this.domValue = DomValue.create(e);

       this.setValue(this.value);
//       Events.link(this.value, this.domValue);
     },

     destroy: function() {
       Events.unlink(this.domValue, this.value);
     },

     indexToValue: function(v) {
       var i = parseInt(v);
       if ( isNaN(i) ) return v;

       if ( Array.isArray(this.choices[i]) ) return this.choices[i][0];

       return v;
     },

     evtToValue: function(e) { return this.indexToValue(e.target.value); }
   },

   listeners:
   [
      {
         model_: 'Method',

         name: 'onMouseOver',
         code: function(e) {
           if ( this.timer_ ) window.clearTimeout(this.timer_);
           this.prev = ( this.prev === undefined ) ? this.value.get() : this.prev;
           this.value.set(this.evtToValue(e));
         }
      },

      {
         model_: 'Method',

         name: 'onMouseOut',
         code: function(e) {
           if ( this.timer_ ) window.clearTimeout(this.timer_);
           this.timer_ = window.setTimeout(function() {
             this.value.set(this.prev || "");
             this.prev = undefined;
           }.bind(this), 1);
         }
      },

      {
         model_: 'Method',

         name: 'onClick',
         code: function(e) {
           this.prev = this.evtToValue(e);
           this.value.set(this.prev);
         }
      }
   ]

});

var RadioBoxView = FOAM({

   model_: 'Model',

   extendsModel: 'ChoiceView',

   name:  'RadioBoxView',

   properties: [
   ],

   methods: {
     toHTML: function() {
       return '<span id="' + this.getID() + '"/></span>';
     },

     updateHTML: function() {
       var out = [];

       for ( var i = 0 ; i < this.choices.length ; i++ ) {
         var choice = this.choices[i];

         if ( Array.isArray(choice) ) {
/*
           var encodedValue = choice[0].replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

           out.push(this.value && choice[0] == this.value.get() ? '\t<option selected value="' : '\t<option value="');
           out.push(encodedValue + '">');
           out.push(choice[1].toString());
*/
         } else {
           out.push(choice.toString());
           out.push(': <input type="radio" name="');
           out.push(this.name);
           out.push('" value="');
           out.push(choice.toString());
           out.push('"');
           var callback = (function(value, choice) { return function() { value.set(choice); }})(this.value, choice);
           out.push('id="' + this.registerCallback('click', callback) + '"');
           if ( this.value && choice == this.value.get() ) out.push(' checked');
           out.push('/> ');
         }
         out.push('</option>');
       }

       this.$.innerHTML = out.join('');
       AbstractView.getPrototype().initHTML.call(this);
     },

     initHTML: function() {
       Events.dynamic(function() { this.choices; }.bind(this), this.updateHTML.bind(this));

//       this.updateHTML();
     }
   },

   listeners:
   [
      {
         model_: 'Method',

         name: 'onClick',
         code: function(evt) {
           console.log('****************', evt, arguments);
         }
      }
   ]

});


var RoleView = FOAM({

   model_: 'Model',

   extendsModel: 'AbstractView',

   name:  'RoleView',

   properties: [
      {
         name:  'roleName',
         type:  'String',
         defaultValue: ''
      },
      {
         name:  'models',
         type:  'Array[String]',
         defaultValue: []
      },
      {
         name:  'selection',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); }
      },
      {
         name:  'model',
         type:  'Model'
      }
   ],

   methods: {
    initHTML: function() {
        var e = this.$;

        this.domValue = DomValue.create(e);

        Events.link(this.value, this.domValue);
    },

    toHTML: function() {
       var str = "";

       str += '<select id="' + this.getID() + '" name="' + this.name + '" size=' + this.size + '/>';
       for ( var i = 0 ; i < this.choices.length ; i++ ) {
          str += "\t<option>" + this.choices[i].toString() + "</option>";
       }
       str += '</select>';

       return str;
    },

    getValue: function() {
        return this.value;
    },

    setValue: function(value) {
        Events.unlink(this.domValue, this.value);
        this.value = value;
        Events.link(value, this.domValue);
    },

    destroy: function() {
        Events.unlink(this.domValue, this.value);
    }
   }
});


var BooleanView = FOAM({
    model_: 'Model',

   extendsModel: 'AbstractView',

   name:  'BooleanView',

   properties: [
      {
         name:  'name',
         label: 'Name',
         type:  'String',
         defaultValue: 'field'
      }
   ],

   methods: {
    toHTML: function() {
       return '<input type="checkbox" id="' + this.getID() + '" name="' + this.name + '" />';
    },

    initHTML: function() {
        var e = this.$;

        this.domValue = DomValue.create(e, 'change', 'checked');

        Events.link(this.value, this.domValue);
    },

    getValue: function() {
        return this.value;
    },

    setValue: function(value) {
        Events.unlink(this.domValue, this.value);
        this.value = value;
        Events.link(value, this.domValue);
    },

    destroy: function() {
        Events.unlink(this.domValue, this.value);
    }
   }
});


var ImageBooleanView = FOAM({
    model_: 'Model',

   extendsModel: 'AbstractView',

   name:  'BooleanView',

   properties: [
      {
         name:  'name',
         label: 'Name',
         type:  'String',
         defaultValue: 'field'
      },
      {
        name: 'value'
      },
      {
        name: 'trueImage'
      },
      {
        name: 'falseImage'
      }
   ],

   methods: {
    image: function() {
      return this.value.value ? this.trueImage : this.falseImage;
    },
    toHTML: function() {
      return '<img id="' + this.getID() + '" name="' + this.name + '" src="' + this.image() + '">';
    },

    initHTML: function() {
      if ( ! this.$ ) return;
      this.$.addEventListener('click', function(evt) {
        evt.stopPropagation();
        this.value.value = ! this.value.value;
        return false;
      }.bind(this), true);

      this.value.addListener(function() {
        this.$.src = this.image();
      }.bind(this));
    },

    getValue: function() {
      return this.value;
    },

    setValue: function(value) {
      Events.unlink(this.domValue, this.value);
      this.value = value;
      Events.link(value, this.domValue);
    },

    destroy: function() {
      Events.unlink(this.domValue, this.value);
    }
   }
});


var TextAreaView = FOAM({

   model_: 'Model',

   extendsModel: 'AbstractView',

   name: 'TextAreaView',
   label: 'Text-Area View',

    properties: [
      {
         name:  'rows',
         type:  'int',
         view:  'IntFieldView',
         defaultValue: 5
      },
      {
         name:  'cols',
         type:  'int',
         view:  'IntFieldView',
         defaultValue: 70
      },
      {
         mode_: 'BooleanProperty',
         name:  'onKeyMode',
         help: 'If true, value is updated on each keystroke.'
      },
      {
         name:  'value',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); },
         postSet: function(newValue, oldValue) {
           Events.unlink(this.domValue, oldValue);

           //Events.follow(this.model, this.domValue);
           try {
             // Events.link(newValue, this.domValue);
             Events.relate(newValue, this.domValue, this.valueToText.bind(this), this.textToValue.bind(this));
           } catch (x) {
           }
         }
      }
    ],

   methods: {
     init: function(args) {
       this.SUPER(args);

       this.cols = (args && args.displayWidth)  || 70;
       this.rows = (args && args.displayHeight) || 10;
     },

     toHTML: function() {
       return '<textarea id="' + this.getID() + '" rows=' + this.rows + ' cols=' + this.cols + ' /> </textarea>';
     },

     setValue: function(value) {
       this.value = value;
     },

     initHTML: function() {
       this.domValue = DomValue.create(this.$, this.onKeyMode ? 'input' : 'change', 'value');

       // Events.follow(this.model, this.domValue);
       // Events.relate(this.value, this.domValue, this.valueToText, this.textToValue);
       this.value = this.value;
     },

     destroy: function() {
       Events.unlink(this.domValue, this.value);
     },

     textToValue: function(text) { return text; },

     valueToText: function(value) { return value; }
  }

});


var FunctionView = FOAM({

   model_: 'Model',

   name:  'FunctionView',

   extendsModel: 'TextAreaView',

   methods: {
      init: function(args) {
         this.SUPER(args);

         this.cols = args.displayWidth  || 80;
         this.rows = args.displayHeight || 8;
         this.onKeyMode = true;
         this.errorView = TextFieldView.create({mode:'read-only'});
      },

      initHTML: function() {
        this.SUPER();

        this.errorView.initHTML();
        this.errorView.$.style.color = 'red';
        this.errorView.$.style.display = 'none';
      },

      toHTML: function() {
         return this.errorView.toHTML() + ' ' + this.SUPER();
      },

      setError: function(err) {
       this.errorView.getValue().set(err || "");
       this.errorView.$.style.display = err ? 'block' : 'none';
      },

      textToValue: function(text) {
         if ( ! text ) return null;

         try {
            var ret = eval("(" + text + ")");

            this.setError(undefined);

            return ret;
         } catch (x) {
            console.log("JS Error: ", x, text);
            this.setError(x);

            return text;
         }
      },

      valueToText: function(value) {
         return value ? value.toString() : "";
      }
   }
});


var JSView = FOAM({

   model_: 'Model',

   name:  'JSView',

   extendsModel: 'TextAreaView',

    methods: {
      init: function(args) {
         this.SUPER();

         this.cols = (args && args.displayWidth)  || 100;
         this.rows = (args && args.displayHeight) || 50;
      },

      textToValue: function(text) {
        try {
          return JSONUtil.parse(text);
        } catch (x) {
          console.log("error");
        }
        return text;
      },

      valueToText: function(val) {
        return JSONUtil.pretty.stringify(val);
      }
    }
});


var XMLView = FOAM({

   model_: 'Model',

   name:  'XMLView',
   label: 'XML View',

   extendsModel: 'TextAreaView',

    methods: {
      init: function(args) {
         this.SUPER();

         this.cols = (args && args.displayWidth)  || 100;
         this.rows = (args && args.displayHeight) || 50;
      },

      textToValue: function(text) {
        // TODO: parse XML
        return text;
      },

      valueToText: function(val) {
        return XMLUtil.stringify(val);
      }
    }
});


var DetailView = Model.create({

  extendsModel: 'AbstractView',

  properties: [
    {
      name:  'model',
      type:  'Model'
    },
    {
      name:  'value',
      type:  'Value',
      valueFactory: function() { return SimpleValue.create(); }
    }
  ],

  methods: {
    getValue: function() {
      return this.value;
    },

    setValue: function (value) {
      if ( this.getValue() ) {
        // todo:
        /// getValue().removeListener(???)
      }
      this.value = value;
      this.updateSubViews();
      // TODO: model this class and make updateSubViews a listener
      // instead of bind()'ing
      value.addListener(this.updateSubViews.bind(this));
    },

    /** Create the sub-view from property info. **/
    createView: function(prop) {
      var proto =
        ! prop.view                   ? TextFieldView     :
        typeof prop.view === 'string' ? GLOBAL[prop.view] :
        prop.view ;

      var view = proto.create(prop);

      try {
        view.setValue(this.get().propertyValue(prop.name));
      } catch (x) { }

      view.prop = prop;
      view.toString = function () { return this.prop.name + "View"; };
      this.addChild(view);

      return view;
    },

    titleHTML: function() {
      return '<tr><th colspan=2 class="heading">' +
        'Edit ' + this.model.label +
        '</th></tr>';
    },

    startColumns: function() { return '<tr><td colspan=2><table valign=top><tr><td valign=top><table>'; },
    nextColumn:   function() { return '</table></td><td valign=top><table valign=top>'; },
    endColumns:   function() { return '</table></td></tr></table></td></tr>'; },

    rowToHTML: function(prop, view) {
      var str = "";

      if ( prop.detailViewPreRow ) str += prop.detailViewPreRow(this);

      str += '<tr class="detail-' + prop.name + '">';
      if ( view.model_ === DAOControllerView ) {
        str += "<td colspan=2><div class=detailArrayLabel>" + prop.label + "</div>";
        str += view.toHTML();
        str += '</td>';
      } else {
        str += "<td class='label'>" + prop.label + "</td>";
        str += '<td>';
        str += view.toHTML();
        str += '</td>';
      }
      str += '</tr>';

      if ( prop.detailViewPostRow ) str += prop.detailViewPostRow(this);

      return str;
    },

    toHTML: function() {
      this.children = [];
      var model = this.model;
      var str  = "";

      str += '<div id="' + this.getID() + '" class="detailView" name="form">';
      str += '<table>';
      str += this.titleHTML();

      for ( var i = 0 ; i < model.properties.length ; i++ ) {
        var prop = model.properties[i];

        if ( prop.hidden ) continue;

        str += this.rowToHTML(prop, this.createView(prop));
      }

      str += '</table>';
      str += '</div>';

      return str;
    },

    initHTML: function() {
      this.SUPER();

      // hooks sub-views upto sub-models
      this.updateSubViews();
    },

    set: function(obj) {
      this.getValue().set(obj);
    },

    get: function() {
      return this.getValue().get();
    },

    updateSubViews: function() {
      var obj = this.get();

      if ( obj === "" ) return;

      for ( var i = 0 ; i < this.children.length ; i++ ) {
        var child = this.children[i];
        var prop  = child.prop;

        if ( ! prop ) continue;

        try {
          child.setValue(obj.propertyValue(prop.name));
        } catch (x) {
          console.log("error: ", prop.name, " ", x);
        }
      }
    },

    setModel: function(obj) {
      if ( ! obj ) return;

      this.obj = obj;
    },

    destroy: function()
    {
    }
  }
});


/** Version of DetailView which allows class of object to change. **/
var DetailView2 = Model.create({

  extendsModel: 'AbstractView',

  properties: [
    {
      name:  'model',
      type:  'Model'
    },
    {
      name:  'value',
      type:  'Value',
      valueFactory: function() { return SimpleValue.create(); }
    }
  ],

  methods: {
    getValue: function() {
      return this.value;
    },

    setValue: function (value) {
      if ( this.getValue() ) {
        // todo:
        /// getValue().removeListener(???)
      }

      this.value = value;

      this.updateSubViews();
      value.addListener(this.updateSubViews.bind(this));
    },

    toHTML: function() {
      this.children = [];
      return '<div id="' + this.getID() + '" class="detailView" name="form">dv2</div>';
    },

    /** Create the sub-view from property info. **/
    createView: function(prop) {
      var view =
        ! prop.view                   ? TextFieldView     :
        typeof prop.view === 'string' ? GLOBAL[prop.view] :
        prop.view ;

      return view.create(prop);
    },

    updateHTML: function() {
      if ( ! this.elementId ) { return; }

      this.children = [];

      var model = this.model;
      var str  = "";

      str += '<table><tr><th colspan=2 class="heading">';
      str += 'Edit ' + model.label;
      str += '</th></tr>';

      for ( var i = 0 ; i < model.properties.length ; i++ ) {
        var prop = model.properties[i];

        if ( prop.hidden ) continue;

        var view = this.createView(prop);

        try {
          view.setValue(this.get().propertyValue(prop.name));
        } catch (x) {
        }

        view.prop = prop;
        view.toString = function () { return this.prop.name + "View"; };
        this.addChild(view);

        str += "<tr><td class='propertyLabel'>" + prop.label + "</td><td>";
        str += view.toHTML();
        str += '</td></tr>';
      }

      str += '</table>';

      this.$.innerHTML = str;
      this.initHTML.super_.call(this);
    },

    initHTML: function() {
      this.SUPER();

      if ( this.get() ) {
        this.updateHTML();

        // hooks sub-views upto sub-models
        this.updateSubViews();
      }
    },

    set: function(obj) {
      this.getValue().set(obj);
    },

    get: function() {
      return this.getValue().get();
    },

    updateSubViews: function() {
      // check if the Value's model has changed
      if ( this.get().model_ !== this.model ) {
        this.model = this.get().model_;
        this.updateHTML();
      }

      var obj = this.get();

      for ( var i = 0; i < this.children.length ; i++ ) {
        var child = this.children[i];
        var prop  = child.prop;

        if ( ! prop ) continue;

        try {
          //           console.log("updateSubView: " + child + " " + prop.name);
          //           console.log(obj.propertyValue(prop.name).get());
          child.setValue(obj.propertyValue(prop.name));
        } catch (x) {
          console.log("Error on updateSubView: ", prop.name, x, obj);
        }
      }
    },

    setModel: function(obj) {
      if ( ! obj ) return;

      this.obj = obj;
    },

    destroy: function() {
    }
  }
});


/** A display-only summary view. **/
var SummaryView = Model.create({

  extendsModel: 'AbstractView',

  properties: [
    {
      name:  'model',
      type:  'Model'
    },
    {
      name:  'value',
      type:  'Value',
      valueFactory: function() { return SimpleValue.create(); }
    }
  ],

  methods: {
    getValue: function() {
      return this.value;
    },

    toHTML: function() {
      this.children = [];
      var model = this.model;
      var obj   = this.get();
      var out   = [];

      out.push('<div id="' + this.getID() + '" class="summaryView">');
      out.push('<table>');

      // TODO: Either make behave like DetailView or else
      // make a mode of DetailView.
      for ( var i = 0 ; i < model.properties.length ; i++ ) {
        var prop = model.properties[i];

        if ( prop.hidden ) continue;

        var value = obj[prop.name];

        if ( ! value ) continue;

        out.push('<tr>');
        out.push('<td class="label">' + prop.label + '</td>');
        out.push('<td class="value">');
        if ( prop.summaryFormatter ) {
          out.push(prop.summaryFormatter(this.strToHTML(value)));
        } else {
          out.push(this.strToHTML(value));
        }
        out.push('</td></tr>');
      }

      out.push('</table>');
      out.push('</div>');

      return out.join('');
    },

    get: function() {
      return this.getValue().get();
    }
  }

});


/** A display-only on-line help view. **/
var HelpView = FOAM({
   model_: 'Model',

   extendsModel: 'AbstractView',

   name: 'HelpView',

   properties: [
      {
         name:  'model',
         type:  'Model'
      }
   ],

   methods: {

   // TODO: it would be better if it were initiated with
   // .create({model: model}) instead of just .create(model)
   // TODO:
   // would be nice if I could mark properties as mandatory
   // if they were required to be initialized
   create: function(model) {
      var obj = AbstractView.create.call(this);

      obj.model = model;

      return obj;
   },

   // TODO: make this a template?
   toHTML: function() {
      var model = this.model;
      var out   = [];

      out.push('<div id="' + this.getID() + '" class="helpView">');

      out.push('<div class="intro">');
      out.push(model.help);
      out.push('</div>');

      for ( var i = 0 ; i < model.properties.length ; i++ ) {
         var prop = model.properties[i];

         if ( prop.hidden ) continue;

         out.push('<div class="label">');
         out.push(prop.label);
         out.push('</div><div class="text">');
         if ( prop.subType /*&& value instanceof Array*/ && prop.type.indexOf('[') != -1 ) {
            var subModel = GLOBAL[prop.subType];
            var subView  = HelpView.create(subModel);
            if ( subModel != model )
               out.push(subView.toHTML());
         } else {
            out.push(prop.help);
         }
         out.push('</div>');
      }

      out.push('</div>');

      return out.join('');
   }

  }

});


var TableView = FOAM({
   model_: 'Model',

   extendsModel: 'AbstractView',

   name: 'TableView',
   label: 'Table View',

   properties: [
      {
         name:  'model',
         type:  'Model'
      },
      {
         name:  'properties',
         type:  'Array[String]',
         defaultValueFn: function() {
           return this.model.tableProperties;
         }
      },
      {
         name:  'hardSelection',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); }
      },
      {
         name:  'selection',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); }
      },
      {
         name:  'children',
         type:  'Array[View]',
         valueFactory: function() { return []; }
      },
      {
         name:  'sortOrder',
         type:  'Comparator',
         defaultValue: undefined
      },
      {
         name:  'dao',
         label: 'DAO',
         type: 'DAO',
         required: true,
         hidden: true,
         postSet: function(val, oldValue) {
           if ( oldValue && this.listener ) oldValue.unlisten(this.listener);
           this.listener && val.listen(this.listener);
           this.repaint_ && this.repaint_();
         }
      },
      {
        name: 'rows',
        type:  'Integer',
        defaultValue: 30,
        postSet: function(val, oldValue) {
           this.repaint();
        }
      },
      {
        model_: 'IntegerProperty',
        name: 'height'
      }
   ],

   methods: {

     layout: function() {
       var parent;
       try {
         parent = window.getComputedStyle(this.$.parentNode.parentNode.parentNode.parentNode.parentNode);
       } catch (x) {
         return;
       }

       if ( ! parent ) return;

       var top = 47;
       var height = 20;
       var rows = $$("tr-" + this.getID());

       // TODO: investigate how this is called on startup, it seems suspicious
       if ( rows.length > 1 ) {
         var row = rows[1];
         var style = window.getComputedStyle(row);
         // If the row is selected its height is less, so if we select two rows
         // we're sure to get one that isn't selected.
         height = Math.max(row.clientHeight, rows[0].clientHeight)+1;
         top = rows[0].offsetTop + rows[0].offsetParent.offsetTop;
      }

      this.rows = Math.floor((toNum(parent.height) - top) / height);
    },

    // Not actually a method, but still works
    // TODO: add 'Constants' to Model
    DOUBLE_CLICK: "double-click", // event topic

     init: function() {
        this.SUPER();

       var self = this;
       this.repaint_ = EventService.animate(this.repaint.bind(this));

       this.listener = {
         put: self.repaint_,
         remove: self.repaint_
       };
     },

   // TODO: it would be better if it were initiated with
   // .create({model: model}) instead of just .create(model)
    toHTML: function() {
      return '<span id="' + this.getID() + '">' +
        this.tableToHTML() +
        '</span>';
    },

    tableToHTML: function() {
        var model = this.model;

        if ( this.callbacks_ ) {
// console.log('Warning: TableView.tableToHTML called twice without initHTML');
          delete this['callbacks_'];
          this.children = [];
        }

        var str = [];
        var props = [];

        str.push('<table class="foamTable ' + model.name + 'Table">');

        //str += '<!--<caption>' + model.plural + '</caption>';
        str.push('<thead><tr>');
        for ( var i = 0 ; i < this.properties.length ; i++ ) {
            var key  = this.properties[i];
            var prop = model.getProperty(key);

            if ( ! prop ) continue;

            if ( prop.hidden ) continue;

            str.push('<th scope=col ');
            str.push('id=' +
                this.registerCallback(
                  'click',
                  (function(table, prop) { return function() {
                    if ( table.sortOrder === prop ) {
                       table.sortOrder = DESC(prop);
                    } else {
                       table.sortOrder = prop;
                    }
                    table.repaint();
                  };})(this, prop)));
            if ( prop.tableWidth ) str.push(' width="' + prop.tableWidth + '"');

            var arrow = '';

            if ( this.sortOrder === prop ) {
               arrow = ' <span class="indicator">&#9650;</span>';
            } else if ( this.sortOrder && DescExpr.isInstance(this.sortOrder) && this.sortOrder.arg1 === prop ) {
               arrow = ' <span class="indicator">&#9660;</span>';
            }

            str.push('>' + prop.tableLabel + arrow + '</th>');

            props.push(prop);
        }
        str.push('</tr><tr style="height:2px"></tr></thead><tbody>');
        if ( this.objs )
        for ( var i = 0 ; i < this.objs.length; i++ ) {
            var obj = this.objs[i];
            var className = "tr-" + this.getID();

            if ( this.selection.get() && obj.id == this.selection.get().id ) {
               this.selection.set(obj);
               className += " rowSelected";
            }

            str.push('<tr class="' + className + '">');

            for ( var j = 0 ; j < props.length ; j++ ) {
                var prop = props[j];

                str.push('<td class="' + prop.name + '">');
                var val = obj[prop.name];
                if ( prop.tableFormatter ) {
                  str.push(prop.tableFormatter(val, obj, this));
                } else {
                  str.push(( val == null ) ? '&nbsp;' : this.strToHTML(val));
                }
                str.push('</td>');
            }

            str.push('</tr>');
        }

        str.push('</tbody></table>');

        return str.join('');
    },

    setValue: function(value) {
       this.dao = value.get();
       return this;
    },

    initHTML: function() {
      this.repaint();
    },

    repaint: function() {
      if ( ! this.dao ) return;
      var self = this;
      var objs = [];
      var selection = this.selection && this.selection.get();
      (this.sortOrder ? this.dao.orderBy(this.sortOrder) : this.dao).limit(this.rows).select({
         put: function(o) { if ( ! selection || ( self.selection && o === self.selection.get() ) ) selection = o; objs.push(o); }} )(function() {
            self.objs = objs;
            if ( self.$ ) {
               self.$.innerHTML = self.tableToHTML();
               self.initHTML_();
               self.height = toNum(window.getComputedStyle(self.$.children[0]).height);
            }
            // self.selection && self.selection.set(selection);
         });
    },

    initHTML_: function() {
      this.initHTML.super_.call(this);

      var es = $$('tr-' + this.getID());
      var self = this;

      if ( es.length ) {
        if ( ! this.sized_ ) {
          this.sized_ = true;
          this.layout();
          return;
        }
      }

      for ( var i = 0 ; i < es.length ; i++ ) {
        var e = es[i];

        e.onmouseover = function(value, obj) { return function() {
          value.set(obj);
        }; }(this.selection, this.objs[i]);
        e.onmouseout = function(value, obj) { return function() {
          value.set(self.hardSelection.get());
        }; }(this.selection, this.objs[i]);
        e.onclick = function(value, obj) { return function(evt) {
           self.hardSelection.set(obj);
           value.set(obj);
           delete value['prevValue'];
           var siblings = evt.srcElement.parentNode.parentNode.childNodes;
           for ( var i = 0 ; i < siblings.length ; i++ ) {
              siblings[i].classList.remove("rowSelected");
           }
           evt.srcElement.parentNode.classList.add('rowSelected');
        }; }(this.selection, this.objs[i]);
        e.ondblclick = function(value, obj) { return function(evt) {
           self.publish(self.DOUBLE_CLICK, obj, value);
        }; }(this.selection, this.objs[i]);
      }

      delete this['callbacks_'];
      this.children = [];
    },

    destroy: function() {
    }
  }
});


// TODO: add ability to set CSS class and/or id
var ActionButton = Model.create({
  name: 'ActionButton',

  extendsModel: 'AbstractView',

  properties: [
    {
      name:  'action'
    },
    {
      name:  'value',
      type:  'Value',
      valueFactory: function() { return SimpleValue.create(); }
    }
  ],

  methods: {

    // TODO: implement and make a listener
    subjectUpdate: function() {
      // console.log('subject update: ' + this.value);
    },

    toHTML: function() {
      this.registerCallback(
        'click',
        function(action) { return function() {
          action.action.apply(this.value.get());
        };}(this.action),
        this.getID());

      var out = [];
      var tooltip = this.action.help ? ' data-tip="' + this.action.help + '" ' : '';
      out.push('<button class="actionButton actionButton-' + this.action.name + '" id="' + this.getID() + '"' + tooltip + '>');

      if ( this.action.iconUrl ) {
        out.push('<img src="' + XMLUtil.escapeAttr(this.action.iconUrl) + '" />');
      }

      if ( this.action.showLabel ) {
        out.push(this.action.label);
      }
      out.push('</button>');

      return out.join('');
    }
  }
});

// TODO: ActionBorder should use this.
var ToolbarView = FOAM({

   model_: 'Model',

   name:  'ToolbarView',
   label: 'Toolbar',

   extendsModel: 'AbstractView',

   properties: [
      {
         model_: 'BooleanProperty',
         name: 'horizontal',
         defaultValue: true
      },
      {
         model_: 'BooleanProperty',
         name: 'icons',
         defaultValueFn: function() {
            return this.horizontal;
         }
      },
      {
         name:  'value',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); },
         postSet: function(newValue, oldValue) {
         }
      },
      {
         name: 'left'
      },
      {
         name: 'top'
      },
      {
         name: 'bottom'
      },
      {
         name: 'right'
      },
      {
         name: 'document'
      }
   ],

   methods: {
      preButton: function(button) { return ' '; },
      postButton: function() { return this.horizontal ? ' ' : '<br>'; },

      openAsMenu: function() {
         // TODO
         var div = this.document.createElement('div');

         div.id = this.nextID();
         div.style.position = 'absolute';
         div.style.border = '2px solid grey';
         this.top ? div.style.top = this.top : div.style.bottom = this.bottom;
         this.left ? div.style.left = this.left : div.style.right = this.right;
         div.style.background = 'white';
         div.style.width = '150px';
         div.innerHTML = this.toHTML(true);

         // Close window when clicked
         div.onclick = function() {
            div.parentNode.removeChild(div);
         };

         div.onmouseout = function(e) {
            if (e.toElement.parentNode != div && e.toElement.parentNode.parentNode != div) {
               div.parentNode.removeChild(div);
            }
         };

         this.document.body.appendChild(div);
         this.initHTML();
      },

      toHTML: function(opt_menuMode) {
         var str = '';
         var cls = opt_menuMode ? 'ActionMenu' : 'ActionToolbar';

         str += '<div id="' + this.getID() + '" class="' + cls + '">';

         for ( var i = 0 ; i < this.children.length ; i++ ) {
           str += this.preButton(this.children[i]) +
             this.children[i].toHTML() +
             this.postButton(this.children[i]);
         }

         str += '</div>';

         return str;
      },

      initHTML: function() {
         this.SUPER();

         // this.value.addListener(function() { console.log('****ActionToolBar'); });
         // When the focus is in the toolbar, left/right arrows should move the
         // focus in the direction.
         this.addShortcut('Right', function(e) {
           var i = 0;
           for (; i < this.children.length; ++i) {
             if (e.target == this.children[i].$)
               break;
           }
           i = (i + 1) % this.children.length;
           this.children[i].$.focus();
         }.bind(this), this.getID());
         this.addShortcut('Left', function(e) {
           var i = 0;
           for (; i < this.children.length; ++i) {
             if (e.target == this.children[i].$)
               break;
           }
           i = (i + this.children.length - 1) % this.children.length;
           this.children[i].$.focus();
         }.bind(this), this.getID());
      },

     addAction: function(a) {
       var view = ActionButton.create({ action: a, value: this.value });
       if ( a.children.length > 0 ) {
         var self = this;
         view.action = a.clone();
         view.action.action = function() {
           var toolbar = ToolbarView.create({
              value: self.value,
              document: self.document,
              left: view.$.offsetLeft,
              top: view.$.offsetTop
           });
           toolbar.addActions(a.children);
           toolbar.openAsMenu(view);
         };
       }
       this.addChild(view);
     },
     addActions: function(actions) {
       actions.forEach(this.addAction.bind(this));
     }
  }
});

// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// TODO: Model
/** Add Action Buttons to a decorated View. **/
/* TODO:
   The view needs a standard interface to determine it's Model (getModel())
   listen for changes to Model and change buttons displayed and enabled
   use isAvailable and isEnabled
   Buttons should be own View with enabled = true/false and own listeners, don't use <button> directly
 */
var ActionBorder = {

    /** @arg actions either a model or an array of actions **/
    create: function(actions, delegate) {
      var obj = {
        __proto__: delegate,
        TYPE:      'ActionBorder',
        actions:   actions.actions || actions,
        // This is a bit hacking, but it prevents
        // both this wrapper and the delegate from
        // having separate element ID's
        // try removing in future
        getID: function() {
          return this.__proto__.getID();
        },
        toHTML: function() {
          var model = this.model;
          var str   = "";

//          str += '<table class="actionBorder"><tr><td>';
          str += this.__proto__.toHTML.call(this);
//          str += '</td></tr><tr><td class="actionBorderActions">';
          str += '<div class="actionToolbar">';

          for ( var i = 0 ; i < this.actions.length ; i++ ) {
            var action = this.actions[i];
            var button = ActionButton.create({action: action, value: this.getValue()});
            str += " " + button.toHTML() + " ";

            this.addChild(button);
          }

          str += '</div>';
//          str += '</td></tr></table>';

          return str;
        }
      };

      // TODO: document why this is needed or remove
      obj.value && obj.value.set(obj.value.get());

      // if delegate doesn't have a getValue method, then add one
      if ( ! obj.getValue ) {
        var dm = SimpleValue.create(obj);
        obj.getValue = function() {
          return dm;
        };
      }

      return obj;
    }
};


var ProgressView = FOAM({

   model_: 'Model',

   extendsModel: 'AbstractView',

   name:  'ProgressView',

   properties: [
      {
         name:  'value',
         type:  'Value',
         valueFactory: function() { return SimpleValue.create(); }
      }
   ],

   methods: {

    toHTML: function() {
        return '<progress value="25" id="' + this.getID() + '" max="100" >25</progress>';
    },

    setValue: function(value) {
        this.value.removeListener(this.listener_);

        this.value = value;
        value.addListener(this.listener_);
    },

    updateValue: function() {
        var e = this.$;

        e.value = parseInt(this.value.get());
    },

    initHTML: function() {
        var e = this.$;

        // TODO: move to modelled listener
        this.listener_ = this.updateValue.bind(this);

        this.value.addListener(this.listener_);
    },

    destroy: function() {
        this.value.removeListener(this.listener_);
    }
  }
});


var ArrayView = {
   create: function(prop) {
      var view = DAOControllerView.create(GLOBAL[prop.subType]);
      return view;
   }
};


var ModelAlternateView = FOAM({
   model_: 'Model',
   name: 'ModelAlternateView',
   extendsModel: 'AlternateView',
   methods: {
      init: function() {
         // TODO: super.init
         this.views = FOAM([
                     {
                        model_: 'ViewChoice',
                        label:  'GUI',
                        view:   'DetailView'
                     },
                     {
                        model_: 'ViewChoice',
                        label:  'JS',
                        view:   'JSView'
                     },
                     {
                        model_: 'ViewChoice',
                        label:  'XML',
                        view:   'XMLView'
                     },
                     {
                        model_: 'ViewChoice',
                        label:  'UML',
                        view:   'XMLView'
                     },
                     {
                        model_: 'ViewChoice',
                        label:  'Split',
                        view:   'SplitView'
                     }
                  ]
               );
      }
   }
});


var GridView = FOAM({
   model_: 'Model',

   extendsModel: 'AbstractView',

   name: 'GridView',

   properties: [
      {
         name:  'row',
         type: 'ChoiceView',
         valueFactory: function() { return ChoiceView.create(); }
      },
      {
         name:  'col',
         label: 'column',
         type: 'ChoiceView',
         valueFactory: function() { return ChoiceView.create(); }
      },
      {
         name:  'acc',
         label: 'accumulator',
         type: 'ChoiceView',
         valueFactory: function() { return ChoiceView.create(); }
      },
      {
         name:  'accChoices',
         label: 'Accumulator Choices',
         type: 'Array',
         valueFactory: function() { return []; }
      },
      {
         name:  'model',
         type: 'Model'
      },
      {
         name:  'dao',
         label: 'DAO',
         type: 'DAO'
      },
      {
         name:  'grid',
         type:  'GridByExpr',
         valueFactory: function() { return GridByExpr.create(); }
      }
   ],

   // TODO: need an 'onChange:' property to handle both value
   // changing and values in the value changing

   // TODO: listeners should be able to mark themselves as mergable
   // or updatable on 'animate', ie. specify decorators
   methods: {
     updateHTML: function() {
       var self = this;
       this.grid.xFunc = this.col.value.get() || this.grid.xFunc;
       this.grid.yFunc = this.row.value.get() || this.grid.yFunc;
       this.grid.acc   = this.acc.value.get() || this.grid.acc;

       this.dao.select(this.grid/*.clone()*/)(function(g) {
         self.$.innerHTML = g.toHTML();
         g.initHTML();
       });
     },

     initHTML: function() {
       var choices = [];
       this.model.properties.orderBy(Property.LABEL).select({put:function(p) {
         choices.push([p, p.label]);
       }});
       this.row.choices = choices;
       this.col.choices = choices;

       this.acc.choices = this.accChoices;

       this.row.initHTML();
       this.col.initHTML();
       this.acc.initHTML();

       this.SUPER();
       this.repaint_ = EventService.animate(this.updateHTML.bind(this));

       /*
       this.grid.addListener(function() {
         this.repaint_();
       }.bind(this));
       */

       this.row.value.addListener(this.repaint_);
       this.col.value.addListener(this.repaint_);
       this.acc.value.addListener(this.repaint_);

       this.updateHTML();
     }
   },

   templates:[
     {
        model_: 'Template',

        name: 'toHTML',
        description: 'TileView',
        template: '<div class="gridViewControl">Rows: <%= this.row.toHTML() %> &nbsp;Cols: <%= this.col.toHTML() %> &nbsp;Cells: <%= this.acc.toHTML() %> <br/></div><div id="<%= this.getID()%>" class="gridViewArea"></div>'
     }
   ]
});

var Mouse = FOAM({
   model_: 'Model',

   name: 'Mouse',

   properties: [
      {
         name:  'x',
         type:  'int',
         view:  'IntFieldView',
         defaultValue: 10
      },
      {
         name:  'y',
         type:  'int',
         view:  'IntFieldView',
         defaultValue: 10
      }
   ],
   methods: {
      connect: function(e) {
         e.addEventListener('mousemove', EventService.merged(this.onMouseMove,1));
      }
   },

   listeners: [
      {
         model_: 'Method',

         name: 'onMouseMove',
         code: function(evt) {
            this.x = evt.offsetX;
            this.y = evt.offsetY;
         }
      }
   ]
});


var ViewChoice = FOAM({

   model_: 'Model',

   name: 'ViewChoice',

   tableProperties: [
      'label',
      'view'
   ],

    properties: [
       {
           name: 'label',
           type: 'String',
           displayWidth: 20,
           defaultValue: '',
           help: "View's label."
       },
       {
           name: 'view',
           type: 'view',
           defaultValue: 'DetailView',
           help: 'View factory.'
       }
    ]

});


var AlternateView = FOAM({

   model_: 'Model',

   extendsModel: 'AbstractView',

   name: 'AlternateView',

    properties: [
       {
          name:  'selection'
       },
       {
           name: 'views',
           type: 'Array[ViewChoice]',
           subType: 'ViewChoice',
           view: 'ArrayView',
           defaultValue: [],
           help: 'View choices.'
       },
       {
           name:  'dao',
           label: 'DAO',
           type: 'DAO',
           postSet: function(dao) {
             // HACK: we should just update the dao of the current view,
             // but not all views currently redraw on DAO update.  Swtich
             // once the views are fixed/finished.
             if ( this.view ) this.installSubView(this.view);
//           if (this.view && this.view.model_ && this.view.model_.getProperty('dao')) this.view.dao = dao;
           }
       },
       {
          name:  'view',
          postSet: function(viewChoice) {
             if ( this.elementId ) this.installSubView(viewChoice);
          },
          hidden: true
       }
    ],

   methods: {
      init: function() {
         this.SUPER();

         this.value = SimpleValue.create("");
         this.view = this.views[0];
     },

      installSubView: function(viewChoice) {
        var view = typeof(viewChoice.view) === 'function' ?
          viewChoice.view(this.value.get().model_, this.value) :
          GLOBAL[viewChoice.view].create({
            model: this.value.get().model_,
            value: this.value
          });

        // TODO: some views are broken and don't have model_, remove
        // first guard when fixed.
        if (view.model_ && view.model_.getProperty('dao')) view.dao = this.dao;

        this.$.innerHTML = view.toHTML();
        view.initHTML();
        view.value && view.value.set(this.value.get());
        //       if ( view.set ) view.set(this.model.get());
        //       Events.link(this.model, this.view.model);
      },

      toHTML: function() {
         var str  = [];
         var viewChoice = this.views[0];
         var buttons;

         str.push('<div style="width:100%;margin-bottom:5px;"><div class="altViewButtons">');
         for ( var i = 0 ; i < this.views.length ; i++ ) {
            var view = this.views[i];
            var listener = function(altView, view) { return function (e) {
               altView.view = view;

               // This is a bit hackish, each element should listen on a 'selected'
               // property and update themselves
               for ( var j = 0 ; j < buttons.length ; j++ ) {
                 DOM.setClass($(buttons[j][0]), 'mode_button_active', false);
               }

               DOM.setClass(e.toElement, 'mode_button_active');

               return false;
            };}(this,view);
//          str.push('<a href="#top" id="' + this.registerCallback('click', listener) + '">' + view.label + '</a>');
            str.push('<a class="buttonify" id="' + this.registerCallback('click', listener) + '">' + view.label + '</a>');
            if ( view.label == this.selected ) viewChoice = view;
         }
         str.push('</div>');
         buttons = this.callbacks_;
         this.buttons_ = buttons;

         str.push('<br/>');
// console.log("viewChoice: ", viewChoice);

//       Events.link(this.model, this.view.model);

//       str.push(this.view.toHTML());
         str.push('<div style="width:100%" id="' + this.getID() + '" class="altView"> </div>');
        str.push('</div>');
         return str.join('');
      },


      initHTML: function() {
         this.SUPER();

         if ( ! this.view ) this.view = this.views[0];
         this.installSubView(this.view);

         DOM.setClass($(this.buttons_[0][0]), 'mode_button_active');
         DOM.setClass($(this.buttons_[0][0]), 'capsule_left');
         DOM.setClass($(this.buttons_[this.buttons_.length-1][0]), 'capsule_right');
      }

  }

});



var FloatFieldView = FOAM({

   model_: 'Model',

   name:  'FloatFieldView',

   extendsModel: 'TextFieldView',

   methods: {
     textToValue: function(text) {
       return parseFloat(text) || "0.0";
     }
   }
});


var IntFieldView = FOAM({

   model_: 'Model',

   name:  'IntFieldView',

   extendsModel: 'TextFieldView',

   methods: {
     textToValue: function(text) {
       return parseInt(text) || "0";
     }
   }
});


var StringArrayView = FOAM({

   model_: 'Model',

   name:  'StringArrayView',

   extendsModel: 'TextFieldView',

   methods: {
     textToValue: function(text) {
       return text.replace(/\s/g,'').split(',');
     },
     valueToText: function(value) {
       return value ? value.toString() : "";
     }
   }
});


var SplitView = FOAM({

   model_: 'Model',

   extendsModel: 'AbstractView',

   name: 'SplitView',

    properties: [
       {
          name:  'view1',
          label: 'View 1'
       },
       {
          name:  'view2',
          label: 'View 2'
       }
    ],

   methods: {
      init: function() {
        this.SUPER();
/*
         this.view1 = AlternateView.create();
         this.view2 = AlternateView.create();
*/
        this.view1 = DetailView2.create();
        this.view2 = JSView.create();

        this.setValue(SimpleValue.create(""));
      },

      // Sets the Data-Model
      setValue: function(value) {
        this.value = value;
        if ( this.view1 ) this.view1.setValue(value);
        if ( this.view2 ) this.view2.setValue(value);
      },

      set: function(obj) {
         this.value.set(obj);
      },

      get: function() {
         return this.value.get();
      },

      toHTML: function() {
         var str  = [];
         str.push('<table width=80%><tr><td width=40%>');
         str.push(this.view1.toHTML());
         str.push('</td><td>');
         str.push(this.view2.toHTML());
         str.push('</td></tr></table><tr><td width=40%>');
         return str.join('');
      },

      initHTML: function() {
         this.view1.initHTML();
         this.view2.initHTML();
      }
  }

});

var ListValueView = FOAM({
  model_: 'Model',

  name: 'ListValueView',
  help: 'Combines an input view with a value view for the edited value.',

  extendsModel: 'AbstractView',

  properties: [
    {
      name: 'valueView'
    },
    {
      name: 'inputView'
    },
    {
      name: 'placeholder',
      postSet: function(newValue) {
        this.inputView.placeholder = newValue;
      }
    },
    {
      name: 'value',
      valueFactory: function() { return SimpleValue.create({ value: [] }); },
      postSet: function(newValue, oldValue) {
        this.inputView.setValue(newValue);
        this.valueView.value = newValue;
      }
    }
  ],

  methods: {
    toHTML: function() {
      return this.valueView.toHTML() + this.inputView.toHTML();
    },
    setValue: function(value) {
      this.value = value;
    },
    initHTML: function() {
      this.SUPER();
      this.valueView.initHTML();
      this.inputView.initHTML();
    }
  }
});

var ListInputView = FOAM({
  model_: 'Model',

  extendsModel: 'AbstractView',

  name: 'ListInputView',

  properties: [
    {
      name: 'dao',
      help: 'The DAO to fetch autocomplete objects from.',
    },
    {
      name: 'property',
      help: 'The property model to map autocomplete objecst to values with.'
    },
    {
      model_: 'ArrayProperty',
      name: 'searchProperties',
      help: 'The properties with which to construct the autocomplete query with.'
    },
    {
      name: 'autocompleteView'
    },
    {
      name: 'placeholder'
    },
    {
      name: 'value',
      help: 'The array value we are editing.',
      valueFactory: function() {
        return SimpleValue.create({
          value: []
        });
      }
    },
    {
      name: 'domInputValue'
    }
  ],

  methods: {
    toHTML: function() {
      this.registerCallback('keydown', this.onKeyDown, this.getID());

      return '<input type="text" id="' + this.getID() + '">' + this.autocompleteView.toHTML();
    },
    setValue: function(value) {
      this.value = value;
    },
    initHTML: function() {
      this.SUPER();
      if ( this.placeholder ) this.$.placeholder = this.placeholder;
      this.autocompleteView.initHTML();
      this.domInputValue = DomValue.create(this.$, 'input');
      this.domInputValue.addListener(this.onInput);
    },
    pushValue: function(v) {
      this.value.set(this.value.get().concat(v));
      this.domInputValue.set('');
      // Previous line doesn't trigger listeners.
      this.onInput();
    },
    popValue: function() {
      var value = this.value.get().slice();
      value.pop();
      this.value.set(value);
    }
  },

  listeners: [
    {
      name: 'onInput',
      code: function() {
        var value = this.domInputValue.get();

        if ( value.charAt(value.length - 1) === ',' ) {
          if ( value.length > 1 ) this.pushValue(value.substring(0, value.length - 1));
          else this.domInputValue.set('');
          return;
        }

        if ( value === '' ) {
          this.autocompleteView.dao = this.dao.where(FALSE);
          return;
        }

        var predicate = OR();
        value = this.domInputValue.get();
        for ( var i = 0; i < this.searchProperties.length; i++ ) {
          predicate.args.push(STARTS_WITH(this.searchProperties[i], value));
        }
        value = this.value.get();
        if ( value.length > 0 ) {
          predicate = AND(NOT(IN(this.property, value)), predicate);
        }
        this.autocompleteView.dao = this.dao.where(predicate);
      }
    },
    {
      name: 'onKeyDown',
      code: function(e) {
        if ( e.keyCode === 40 /* down */) {
          this.autocompleteView.nextSelection();
          e.preventDefault();
        } else if ( e.keyCode === 38 /* up */ ) {
          this.autocompleteView.prevSelection();
          e.preventDefault();
        } else if ( e.keyCode === 13 /* RET */ || e.keyCode === 9 /* TAB */ ) {
          if ( this.autocompleteView.value.get() ) {
            this.pushValue(
              this.property.f(this.autocompleteView.value.get()));
            e.preventDefault();
          }
        } else if ( e.keyCode === 8 && this.domInputValue.get() === '' ) {
          this.popValue();
        }
      }
    }
  ]
});

var ArrayTileView = FOAM({
  model_: 'Model',

  extendsModel: 'AbstractView',

  name: 'ArrayTileView',

  properties: [
    {
      name: 'dao'
    },
    {
      name: 'property'
    },
    {
      name: 'tileView'
    },
    {
      name: 'value',
      valueFactory: function() { return SimpleValue.create(); },
      postSet: function(newValue, oldValue) {
        oldValue && oldValue.removeListener(this.paint);
        newValue.addListener(this.paint);
      }
    },
    {
      model_: 'BooleanProperty',
      name: 'painting',
      defaultValue: false
    }
  ],

  methods: {
    toHTML: function() {
      return '<ul id="' + this.getID() + '" class="arrayTileView"></ul>';
    },
  },

  listeners: [
    {
      name: 'paint',
      animate: true,
      code: function() {
        // If we're currently painting, don't actually paint now,
        // queue up another paint on the next animation frame.
        // This doesn't spin infinitely because paint is set to animate: true,
        // meaning that it's merged to the next animation frame.
        if ( this.painting ) {
          this.paint();
          return;
        }

        this.painting = true;
        this.children = [];
        var value = this.value.get();
        var count = value.length;
        var self = this;
        var render = function() {
          self.$.innerHTML = self.children.map(
            function(c) { return '<li class="arrayTileItem">' + c.toHTML() + '</li>'; }).join('');
          self.children.forEach(
            function(c) { c.initHTML(); });
          self.painting = false;
        };

        if ( value.length == 0 ) render();
        for ( var i = 0; i < value.length; i++ ) {
          this.dao.find(EQ(this.property, value[i]), {
            put: function(obj) {
              var view = self.tileView.create();
              view.value.set(obj);
              self.addChild(view);
              count--;
              if ( count == 0 ) render();
            },
            error: function() {
              // Ignore missing values
              count--;
              if ( count == 0 ) render();
            },
          });
        }
      }
    }
  ]
});

var AutocompleteListView = FOAM({
  model_: 'Model',

  extendsModel: 'AbstractView',

  name: 'AutocompleteListView',

  properties: [
    {
      name: 'dao',
      postSet: function(newValue, oldValue) {
        oldValue && oldValue.unlisten(this.paint);
        newValue.listen(this.paint);
        this.value.set('');
        this.paint();
      },
      hidden: true
    },
    {
      name: 'next'
    },
    {
      name: 'prev'
    },
    {
      name: 'value',
      hidden: true,
      valueFactory: function() { return SimpleValue.create(); },
      postSet: function(newValue, oldValue) {
        if ( oldValue ) {
          oldValue.removeListener(this.paint);
        }
        newValue.addListener(this.paint);
      }
    },
    {
      name: 'model',
      hidden: true
    },
    {
      name: 'innerView',
      type: 'AbstractView',
      preSet: function(value) {
        if ( typeof value === "string" ) value = GLOBAL[value];
        return value;
      },
      defaultValueFn: function() {
        return this.model.listView;
      }
    },
    {
      model_: 'BooleanProperty',
      name: 'painting',
      defaultValue: false
    },
    {
      model_: 'IntegerProperty',
      name: 'count',
      defaultValue: 20
    },
    {
      model_: 'IntegerProperty',
      name: 'left'
    },
    {
      model_: 'IntegerProperty',
      name: 'top'
    },
  ],

  methods: {
    setValue: function(value) {
      this.value = value;
    },

    toHTML: function() {
      return '<ul class="autocompleteListView" id="' + this.getID() + '"></ul>';
    },

    initHTML: function() {
      this.SUPER();
      this.$.style.display = 'none';
      var self = this;
      this.propertyValue('left').addListener(function(v) {
        self.$.left = v;
      });
      this.propertyValue('top').addListener(function(v) {
        self.$.top = v;
      });
    },

    nextSelection: function() {
      this.value.set(this.next);
    },

    prevSelection: function() {
      this.value.set(this.prev);
    }
  },

  listeners: [
    {
      name: 'paint',
      animate: true,
      code: function() {
        // TODO Determine if its worth double buffering the dom.

        // Don't start a new paint if we're in the middle of one.
        if ( this.painting) {
          this.paint();
          return;
        }

        // Clear old list
        this.$.innerHTML = '';
        this.painting = true;
        var self = this;

        var found = false;
        var first;
        var second;
        self.next = '';
        self.prev = '';

        this.dao.limit(this.count).select({
          put: function(obj) {
            if ( found && ! self.next ) {
              self.next = obj;
            }

            if ( obj.id === self.value.get().id ) {
              found = true;
            }

            if ( ! found && self.value.get() ) {
              self.prev = obj;
            }

            if ( ! self.value.get() ) {
              self.value.set(obj);
              found = true;
            }

            var view = self.innerView.create({});
            var container = document.createElement('li');
            container.onclick = function() {
              self.value.set(obj);
            };
            container.className = 'autocompleteListItem';
            if ( obj.id === self.value.get().id ) {
              container.className += ' autocompleteSelectedItem';
            }
            self.$.appendChild(container);
            view.value.set(obj);
            container.innerHTML = view.toHTML();
            view.initHTML();
            if ( ! first ) {
              first = [obj, container];
            }
            if ( first && ! second ) {
              second = obj;
            }
          },
          eof: function() {
            self.painting = false;
            if ( ! first ) self.$.style.display = 'none';
            else self.$.style.display = '';

            if ( ! found ) {
              if ( ! first ) {
                self.value.set('');
                self.$.style.display = 'none';
              } else {
                self.value.set(first[0]);
                first[1].className += 'selectedListItem';
                self.prev = '';
                self.next = second;
              }
            }
          },
          error: function() {
            console.error.apply(console, arguments);
            self.painting = false;
          }
        });
      }
    }
  ]
});
