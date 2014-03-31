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

Object.defineProperty(Object.prototype, 'addFeature', {
  configurable: true,
  enumerable: true,
  writable: true,
  value: function(f) {
    if ( this.prototype ) f.install(this, this.prototype);
    else f.install(this, this);
  }
});

// Replace AbstractPrototype methods with FO versions.
AbstractPrototype.create = function(args) {
  var obj = Object.create(this);
  obj.instance_ = {};

  if ( args instanceof Object ) obj.copyFrom(args);

  obj.init(args);

  return obj;
};

AbstractPrototype.copyFrom = function(args) {
  var self = this;
  this.model_.features.forEach(function(f) {
    f.copy && f.copy(self, args);
  });
  return this;
};

AbstractPrototype.init = function () {
  var self = this;
  this.model_.features.forEach(function(f) {
    f.initialize && f.initialize(self);
  });
};

/**
 * Override a method, making calling the overridden method possible by
 * calling this.SUPER();
 **/
function override(cls, methodName, method) {
  var super_ = cls[methodName];

  var SUPER = function() { return super_.apply(this, arguments); };

  var f = function() {
    var OLD_SUPER = this.SUPER;
    this.SUPER = SUPER;
    try {
      return method.apply(this, arguments);
    } finally {
      this.SUPER = OLD_SUPER;
    }
  };

  f.super_ = super_;

  cls[methodName] = f;
}

function bootstrap(scope) {
  function simpleProperty(obj, name) {
    Object.defineProperty(obj, name, {
      configurable: true,
      writable: true,
      enumerable: false,
      get: function() { return this.instance_[name]; },
      set: function(v) { this.instance_[name] = v; }
    });
  }

  // Make function objects act like Method instances.
  Object.defineProperty(Function.prototype, 'code', {
    configurable: true,
    writable: false,
    enumerable: true,
    get: function() { return this; },
  });

  var Model = { instance_: {} };
  scope.set('Model', Model);
  Model.prototype_ = {
    __proto__: AbstractPrototype,
    model_: Model,
    addFeature: function(f) {
      this.features.add(f);
    },
    create: function(args) {
      var proto = this.getPrototype();
      if ( this.model_ === this ) return proto.__proto__.create.call(proto, args);
      return proto.create(args);
    },
    getPrototype: function() {
      if ( ! this.prototype_ ) this.prototype_ = Object.create(AbstractPrototype);
      if ( this.prototype_.version_ !== this.features.version_ )
        this.rebuildPrototype(this.prototype_);
      return this.prototype_;
    },
    rebuildPrototype: function(currentProto) {
      var proto = Object.create(AbstractPrototype);
      proto.model_ = this;
      proto.name_ = this.name;
      proto.TYPE = this.name + "Prototype";
      proto.version_ = this.features.version;

      var model = this;
      // Only install features local to this model.
      this.features.localForEach(function(f) {
        if ( f.name === "" ) debugger;
        f.install(model, proto);
      }, false);

      currentProto.__proto__ = Object.prototype;
      var props = Object.getOwnPropertyNames(currentProto);
      for ( var i = 0; i < props.length; i++ ) {
        delete currentProto[props[i]];
      }

      var tmp = proto.__proto__;
      proto.__proto__ = Object.prototype;

      props = Object.getOwnPropertyNames(proto);
      for ( var i = 0; i < props.length; i++ ) {
        Object.defineProperty(currentProto, props[i],
                              Object.getOwnPropertyDescriptor(proto, props[i]));
      }
      currentProto.__proto__ = tmp;
    }
  };

  Model.__proto__ = Model.prototype_;
  simpleProperty(Model.prototype_, "features");
  Model.features = FeatureSet.create();
  Model.prototype_.version_ = Model.features.version;

  var Method = { instance_: {} };
  scope.set('Method', Method);
  Method.__proto__ = Model.getPrototype();
  Method.features = FeatureSet.create();
  Method.prototype_ = {
    __proto__: AbstractPrototype,
    model_: Method,
    version_: Method.features.version,
    install: function(model, proto) {
      if ( Object.prototype.hasOwnProperty.call(proto, this.name) )
        delete proto[this.name];

      if ( proto[this.name] )
        override(proto, this.name, this.code)
      else
        proto[this.name] = this.code;
    }
  };
  simpleProperty(Method.prototype_, "name");
  simpleProperty(Method.prototype_, "code");

  var Property = { instance_: {} };
  scope.set('Property', Property);
  Property.__proto__ = Model.getPrototype();
  Property.features = FeatureSet.create();
  Property.prototype_ = {
    __proto__: AbstractPrototype,
    model_: Property,
    version_: Property.features.version,
    install: function(model, proto) {
      var name = this.name;
      var valueFactory = this.valueFactory;

      model[this.name.constantize()] = this;

      Object.defineProperty(proto, this.name, {
        configurable: true,
        enumerable: true,
        writable: true,
        get: function() {
          if ( ! this.instance_[name] ) {
            if ( valueFactory ) return this.instance_[name] = valueFactory.call(this);
            return "";
          }
          return this.instance_[name];
        },
        set: function(v) {
          this.instance_[name] = v;
        }
      });
    },
    initialize: function initialize(obj) {
      if ( this.valueFactory && ! obj.instance_[this.name] )
        obj[this.name] = this.valueFactory.call(obj);
    },
    copy: function(obj, args) {
      // Don't copy default values.
      if ( !args ) return;

      if ( args.instance_ && !args.instance_.hasOwnProperty(this.name) ) return;

      if ( this.name in args ) obj[this.name] = args[this.name];
    }
  };
  simpleProperty(Property.prototype_, "name");
  simpleProperty(Property.prototype_, "valueFactory");

  function forceInstall(feature, model) {
    model.features.add(feature);
    feature.install(model, model.prototype_);
    model.prototype_.version_ = model.features.version;
  }

  // Bootstreap the real property and method features we put in earlier.
  var tmp = Property.create();
  tmp.name = "name"
  forceInstall(tmp, Property);

  tmp = Property.create({ name: 'valueFactory' });
  forceInstall(tmp, Property);

  tmp = Property.create({
    name: 'features',
    valueFactory: function() { return FeatureSet.create(); }
  });
  forceInstall(tmp, Model);

  tmp = Property.create({
    name: 'name',
  });
  forceInstall(tmp, Model);

  Model.name = 'Model';
  Property.name = 'Property';
  Method.name = 'Method';

  tmp = Property.create({
    name: 'name',
  });
  forceInstall(tmp, Method);

  tmp = Property.create({
    name: 'code',
  });
  forceInstall(tmp, Method);

  function upgradeMethod(model, name) {
    var tmp = Method.create({
      name: name,
      code: model.prototype_[name]
    });
    forceInstall(tmp, model);
  }

  upgradeMethod(Method, 'install');
  upgradeMethod(Model, 'create');
  upgradeMethod(Model, 'getPrototype');
  upgradeMethod(Model, 'rebuildPrototype');
debugger;
  upgradeMethod(Model, 'addFeature');
  upgradeMethod(Property, 'install');
  upgradeMethod(Property, 'initialize');
  upgradeMethod(Property, 'copy');

  // Invalidate current prototypes.
  Model.rebuildPrototype(Model.prototype_);
  Method.rebuildPrototype(Method.prototype_);
  Property.rebuildPrototype(Property.prototype_);
};

var featureDAO = [
  ['Model', 'Method', function install(model, proto) {
    if ( proto ) proto[this.name] = this;
    else model[this.name] = this;
  }, true],
  ['Model', 'Method', function isSubModel(model) {
    try {
      return model && ( model === this || this.isSubModel(model.getPrototype().__proto__.model_) );
    } catch (x) {
      return false;
    }
  }],
  ['Model', 'Method',  function getPropertyWithoutCache_(name) {
    var p = null;
    this.features.forEach(function(f) {
      if ( Property.isInstance(f) && f.name === name ) p = f;
    });
    return p;
  }],
  ['Model', 'Method', function getProperty(name) {
    return this.getPropertyWithoutCache_(name);
  }],
  ['Model', 'Method', function hashCode() {
    var string = "";
    var self = this;
    this.features.forEach(function(f) {
      string += f.f(self.toString());
    });
    return string.hashCode();
  }],
  ['Model', 'Method', function isInstance(obj) {
    return obj && obj.model_ && this.isSubModel(obj.model_);
  }],

  ['Property', 'Property', { name: 'defaultValue' }],
  ['Property', 'Property', { name: 'valueFactory' }],
  ['Property', 'Property', { name: 'scope', defaultValue: 'instance_' }],
  ['Property', 'Property', { name: 'defaultValueFn' }],
  ['Property', 'Property', { name: 'scopeName' }],
  ['Property', 'Property', { name: 'postSet' }],
  ['Property', 'Property', { name: 'preSet' }],
  ['Property', 'Property', { name: 'getter' }],
  ['Property', 'Property', { name: 'setter' }],
  ['Property', 'Method', function install(model, proto) {
    var prop = this;

    var parent = model.extendsModel;
    if ( parent && (parent = get(parent)) ) {
      var superProp = parent.getProperty(this.name);
      if ( superProp ) {
        prop = superProp.clone().copyFrom(prop);
      }
    }

    var scope = prop.scope || 'instance_';
    var scopeName = prop.scopeName || prop.name;
    var name = prop.name;
    var defaultValueFn = prop.defaultValueFn;
    var defaultValue = prop.defaultValue;
    var valueFactory = prop.valueFactory;
    var preSet = prop.preSet;
    var postSet = prop.postSet;

    // TODO: add caching
    if ( ! AbstractPrototype.__lookupGetter__(name + '$') ) {
      Object.defineProperty(AbstractPrototype, name + '$', {
        get: function() { return this.propertyValue(name); },
        set: function(value) { Events.link(value, this.propertyValue(name)); }
      });
    }

    model[scopeName.constantize()] = prop;

    if ( prop.getter ) {
      proto.__defineGetter__(name, prop.getter);
    } else {
      proto.defineFOAMGetter(
        name, defaultValueFn ?
          (function() {
            if ( this[scope][scopeName] === undefined ) {
              if ( valueFactory ) return this[scope][scopeName] = valueFactory.call(this);
              return defaultValueFn.call(this, prop);
            }
            return this[scope][scopeName];
          }) :
        (function() {
          if ( this[scope][scopeName] === undefined ) {
            if ( valueFactory ) return this[scope][scopeName] = valueFactory.call(this);
            return defaultValue;
          }
          return this[scope][scopeName]
        }));
    }

    if ( prop.setter ) {
      proto.defineFOAMSetter(name, prop.setter);
    } else {
      set = function(oldValue, newValue) {
        this.instance_[name] = newValue;
      };

      if ( prop.type === 'int' || prop.type === 'float' ) {
        set = (function(set) { return function(oldValue, newValue) {
          set.call(this, oldValue, typeof newValue !== 'number' ? Number(newValue) : newValue);
        }; })(set);
      }

      if ( prop.postSet ) {
        set = (function(set, postSet) { return function(oldValue, newValue) {
          set.call(this, oldValue, newValue);
          postSet.call(this, oldValue, newValue)
        }; })(set, prop.postSet);
      }

      var propertyTopic = PropertyChangeSupport.propertyTopic(name);
      set = (function(set) { return function(oldValue, newValue) {
        set.call(this, oldValue, newValue);
        this.propertyChange_(propertyTopic, oldValue, newValue);
      }; })(set);

      if ( prop.preSet ) {
        set = (function(set, preSet) { return function(oldValue, newValue) {
          set.call(this, oldValue, preSet.call(this, newValue, oldValue, prop));
        }; })(set, prop.preSet);
      }

      set = (function(set) { return function(newValue) {
        set.call(this, this[name], newValue);
      }; })(set);

      proto.defineFOAMSetter(name, set);
    }

    if ( scope === "static_" && prop.valueFactory ) {
      proto[prop.name] = prop.valueFactory();
    }
  }],

  [null, 'Model', { name: 'Constant' }],
  ['Constant', 'Property', { name: 'name' }],
  ['Constant', 'Property', { name: 'value' }],
  ['Constant', 'Method', function install(model, proto) {
    var value = this.value;
    Object.defineProperty(proto, this.name, {
      configurable: true,
      writable: true,
      enumerable: true,
      get: function() { return value },
      set: function(v) {
        console.warn('Changing constant value');
        value = v;
      }
    });
  }],

  [null, 'Model', { name: 'Extends' }],
  ['Extends', 'Method', function create(args) {
    if ( typeof args === "string" ) return this.SUPER({ parent: args });
    return this.SUPER(args);
  }],
  ['Extends', 'Property', { name: 'parent' }],
  ['Extends', 'Method', function install(model, proto) {
    var parent = get(this.parent);
    proto.__proto__ = parent.getPrototype();
    model.features.parent = parent.features;

    // TODO: Is this correct?
    model.__proto__ = parent;
  }],

  ['Property', 'Method', function f(obj) { return obj[this.name] || obj; }],
  ['Property', 'Property', {
    name: 'label'
  }],
  ['Property', 'Property', {
    name: 'tableLabel'
  }],
  ['Property', 'Property', {
    name: 'type'
  }],
  ['Property', 'Property', {
    name: 'javaType',
    defaultValueFn: function() { return this.type; }
  }],
  ['Property', 'Property', {
    name: 'javascriptType',
    defaultValueFn: function() { return this.type; }
  }],
  ['Property', 'Property', {
    name: 'shortName'
  }],
  ['Property', 'Property', {
    name: 'aliases',
    valueFactory: function() { return []; }
  }],
  ['Property', 'Property', {
    name: 'mode',
    defaultValue: 'read-write'
  }],
  ['Property', 'Property', {
    name: 'subType'
  }],
  ['Property', 'Property', {
    name: 'units'
  }],
  ['Property', 'Property', {
    name: 'required',
    defaultValue: true
  }],
  ['Property', 'Property', {
    name: 'hidden',
    defaultValue: false
  }],
  ['Property', 'Property', {
    name: 'transient',
    defaultValue: false
  }],
  ['Property', 'Property', {
    name: 'displayWidth',
    defaultValue: 30
  }],
  ['Property', 'Property', {
    name: 'displayHeight',
    defaultvalue: 1
  }],
  ['Property', 'Property', {
    name: 'view',
    defaultValue: 'TextFieldView'
  }],
  ['Property', 'Property', {
    name: 'detailViewPreRow',
    defaultValue: function() { return ""; }
  }],
  ['Property', 'Property', {
    name: 'defaultViewPostRow',
    defaultValue: function() { return ""; }
  }],
  ['Property', 'Property', {
    name: 'tableFormatter'
  }],
  ['Property', 'Property', {
    name: 'summaryFormatter'
  }],
  ['Property', 'Property', {
    name: 'tableWidth'
  }],
  ['Property', 'Property', {
    name: 'prototag'
  }],
  ['Property', 'Property', {
    name: 'actionFactory'
  }],
  ['Property', 'Property', {
    name: 'compareProperty',
    defaultValue: function(o1, o2) {
      return (o1.localeCompare || o1.compareTo).call(o1, o2);
    }
  }],
  ['Property', 'Method', function compare(o1, o2) {
    return this.compareProperty(this.f(o1), this.f(o2));
  }],
  ['Property', 'Method', function toSQL() {
    return this.name;
  }],
  ['Property', 'Method', function toMQL() {
    return this.name;
  }],

  // Types
  [null, 'Model', { name: 'StringProperty' }],
  ['StringProperty', 'Extends', 'Property'],
  ['Property', 'StringProperty', {
    name: 'help',
    help: 'Help text associated with the property.'
  }],
  ['Property', 'StringProperty', {
    name: 'name',
    help: 'The coding identifier for the property.'
  }],
  ['Property', 'StringProperty', {
    name: 'label',
    help: 'The display label for the feature.',
    defaultValueFn: function() { return this.name.labelize(); }
  }],
  ['Model', 'StringProperty', {
    name: 'tableLabel',
    help: 'The table display label for the feature.',
    defaultValueFn: function() { return this.name.labelize(); }
  }],
  ['Property', 'StringProperty', {
    name: 'type',
    required: true,
    help: 'The FOAM type of this property.'
  }],
  ['StringProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'String',
  }],
  ['Property', 'StringProperty', {
    name: 'javaType',
    help: 'The Java type of this property.'
  }],
  ['StringProperty', 'StringProperty', {
    name: 'javaType',
    defaultValue: 'String'
  }],

  [null, 'Model', { name: 'IntegerProperty' }],
  ['IntegerProperty', 'Extends', 'Property'],
  ['IntegerProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Integer'
  }],
  ['IntegerProperty', 'StringProperty', {
    name: 'javaType',
    defaultValue: 'int'
  }],
  ['IntegerProperty', 'IntegerProperty', {
    name: 'defaultValue',
    defaultValue: 0
  }],
  ['Property', 'IntegerProperty', {
    name: 'displayWidth',
    defaultValue: 30,
    help: 'The display width of the property.'
  }],
  ['Property', 'IntegerProperty', {
    name: 'displayHeight',
    defaultValue: 1,
    help: 'The display height of the property.'
  }],
  ['IntegerProperty', 'IntegerProperty', {
    name: 'displayWidth',
    defaultValue: 8
  }],
  ['StringProperty', 'IntegerProperty', {
    name: 'displayHeight',
    displayWidth: 8,
    defaultValue: 1,
  }],

  [null, 'Model', { name: 'BooleanProperty' }],
  ['BooleanProperty', 'Extends', 'Property'],
  ['BooleanProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Boolean'
  }],
  ['BooleanProperty', 'StringProperty', {
    name: 'javaType',
    defaultValue: 'Boolean'
  }],
  ['Property', 'BooleanProperty', {
    name: 'required',
    defaultValue: false
  }],
  [null, 'Model', { name: 'FunctionProperty' }],
  ['FunctionProperty', 'Extends', 'Property'],
  ['Property', 'FunctionProperty', {
    name: 'defaultValueFn',
    help: 'The property\'s default value function.'
  }],
  ['Property', 'FunctionProperty', {
    name: 'valueFactory',
    help: 'Factory for creating inital value when object instantiated.'
  }],

  ['FunctionProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Function'
  }],
  ['FunctionProperty', 'StringProperty', {
    name: 'view',
    defaultValue: 'FunctionView'
  }],

  ['Property', 'FunctionProperty', {
    name: 'preSet',
    help: 'An adapter function called before normal setter logic.'
  }],
  ['Property', 'FunctionProperty', {
    name: 'postSet',
    help: 'A function called after normal setter logic, but before property change event fired.'
  }],
  ['Property', 'FunctionProperty', {
    name: 'setter',
    help: 'The property\'s setter function.'
  }],
  ['Property', 'FunctionProperty', {
    name: 'getter',
    help: 'The prpoerty\'s getter function.'
  }],
  ['Property', 'FunctionProperty', {
    name: 'tableFormatter',
    label: 'Table View Cell Formatter',
    help: 'Function to format value for display in TableView'
  }],
  ['Property', 'FunctionProperty', {
    name: 'summaryFormatter',
    label: 'Summary View Formatter',
    help: 'Function to format value for display in SummarView'
  }],

  [null, 'Model', { name: 'ArrayProperty' }],
  ['ArrayProperty', 'Extends', 'Property'],
  ['ArrayProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Array'
  }],
  ['ArrayProperty', 'StringProperty', {
    name: 'subType',
    help: 'The FOAM sub-type of this property'
  }],
  ['ArrayProperty', 'FunctionProperty', {
    name: 'preSet',
    defaultValue: function(value, oldValue, prop) {
      var m = get(prop.subType);

      if ( ! m || ! m.model_ ) {
        return value;
      }

      for ( var i = 0; i < value.length; i++ ) {
        value[i] = value[i].model_ ? FOAM(value[i]) : m.create(value[i]);
      }
      return value;
    }
  }],
  ['ArrayProperty', 'StringProperty', {
    name: 'javaType',
    defaultValueFn: function(p) { return p.subType + '[]'; }
  }],
  ['ArrayProperty', 'StringProperty', {
    name: 'view',
    defaultvlaue: 'ArrayView'
  }],
  ['ArrayProperty', 'FunctionProperty', {
    name: 'valueFactory',
    defaultValue: function() { return []; }
  }],

  [null, 'Model', {
    name: 'ReferenceProperty',
    help: 'A foreign key reference to another Entity.'
  }],
  ['ReferenceProperty', 'Extends', 'Property'],
  ['ReferenceProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Reference'
  }],
  ['ReferenceProperty', 'StringProperty', {
    name: 'javaType',
    // TODO: should obtain primary-key type from subType
    defaultValueFn: function(p) { return 'Object'; },
  }],
  ['ReferenceProperty', 'StringProperty', {
    name: 'view',
    // TODO: should be 'KeyView'
    defaultValue: 'TextFieldView'
  }],

  [null, 'Model', {
    name: 'StringArrayProperty',
    help: 'An array of String values.'
  }],
  ['StringArrayProperty', 'Extends', 'ArrayProperty'],
  ['StringArrayProperty', 'StringProperty', {
    name: 'subType',
    defaultValue: 'String'
  }],
  ['StringArrayProperty', 'StringProperty', {
    name: 'view',
    defaultValue: 'StringArrayView'
  }],
  [null, 'Model', { name: 'DateProperty' }],
  ['DateProperty', 'Extends', 'Property'],
  ['DateProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Date',
  }],
  ['DateProperty', 'StringProperty', {
    name: 'javaType',
    defaultValue: 'Date'
  }],
  ['DateProperty', 'StringProperty', {
    name: 'view',
    defaultValue: 'DateFieldView'
  }],
  ['DateProperty', 'FunctionProperty', {
    name: 'preSet',
    defaultValue: function(d) {
      return typeof d === 'string' ? new Date(d) : d;
    }
  }],
  ['DateProperty', 'FunctionProperty', {
    name: 'tableFormatter',
    defaultValue: function(d) {
      var now = new Date();
      var seconds = Math.floor((now - d)/1000);
      if (seconds < 60) return 'moments ago';
      var minutes = Math.floor((seconds)/60);
      if (minutes == 1) {
        return '1 minute ago';
      } else if (minutes < 60) {
        return minutes + ' minutes ago';
      } else {
        var hours = Math.floor(minutes/60);
        if (hours < 24) {
          return hours + ' hours ago';
        }
        var days = Math.floor(hours / 24);
        if (days < 7) {
          return days + ' days ago';
        } else if (days < 365) {
          var year = 1900+d.getYear();
          var noyear = d.toDateString().replace(" " + year, "");
          return /....(.*)/.exec(noyear)[1];
        }
      }
      return d.toDateString();
    }
  }],

  [null, 'Model', { name: 'DateTimeProperty' }],
  ['DateTimeProperty', 'Extends', 'DateProperty'],
  ['DateTimeProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'datetime'
  }],
  ['DateTimeProperty', 'StringProperty', {
    name: 'view',
    defaultValue: 'DateTimeFieldView'
  }],

  [null, 'Model', { name: 'FloatProperty' }],
  ['FloatProperty', 'Extends', 'Property'],
  ['FloatProperty', 'StringProperty', {
    name: 'type',
    defaultValue: 'Float'
  }],
  ['FloatProperty', 'StringProperty', {
    name: 'javaType',
    defaultValue: 'double'
  }],
  ['FloatProperty', 'IntegerProperty', {
    name: 'displayWidth',
    defaultValue: 15
  }],

  [null, 'Model', { name: 'ReferenceArrayProperty' }],
  ['ReferenceArrayProperty', 'Extends', 'StringArrayProperty'],
  [null, 'Model', { name: 'EMailProperty' }],
  ['EMailProperty', 'Extends', 'StringProperty'],
  [null, 'Model', { name: 'URLProperty' }],
  ['URLProperty', 'Extends', 'StringProperty'],

  ['Property', 'FunctionProperty', {
    name: 'detailViewPreRow',
    defaultValue: function() { return ""; },
    help: 'Inject HTML before row in DetailView.'
  }],
  ['Property', 'FunctionProperty', {
    name: 'detailViewPostRow',
    defaultValue: function() { return ""; },
    help: 'Inject HTML before row in DetailView.'
  }],

  ['Model', 'StringProperty', {
    name: 'label',
    defaultValueFn: function() { return this.name.labelize(); }
  }],

  // mm4Methods
  [null, 'Model', {
    name: 'Action'
  }],
  ['Action', 'StringProperty', {
    name: 'name',
    help: 'The coding identifier for the action.',
  }],
  ['Action', 'StringProperty', {
    name: 'label',
    help: 'The display label for the action.',
    defaultValueFn: function() { return this.name.labelize(); }
  }],
  ['Action', 'StringProperty', {
    name: 'help',
    label: 'Help Text',
    help: 'Help text associated with the action.'
  }],
  ['Action', 'BooleanProperty', {
    name: 'default',
    defaultValue: false,
    help: 'Indicates if this is the default action.'
  }],
  ['Action', 'FunctionProperty', {
    name: 'isAvailable',
    label: 'Available',
    defaultValue: function() { return true; },
    help: 'Function to determine if action is enabled.'
  }],
  ['Action', 'FunctionProperty', {
    name: 'isEnabled',
    label: 'Enabled',
    defaultValue: function() { return true; },
    help: 'Function to determine if action is enabled'
  }],
  ['Action', 'URLProperty', {
    name: 'iconUrl',
    defaultValue: undefined,
    help: 'Provides a url for an icon to render for this action.'
  }],
  ['Action', 'BooleanProperty', {
    name: 'showLabel',
    defaultValue: true,
    help: 'Property indicating whether the label should be rendered along side the icon.'
  }],
  ['Action', 'ArrayProperty', {
    name: 'children',
    subType: 'Action',
    help: 'Child actions of this action.',
    persistent: false
  }],
  ['Action', 'ReferenceProperty', {
    name: 'parent',
    help: 'The parent action of this action.'
  }],
  ['Action', 'FunctionProperty', {
    name: 'action',
    displayWidth: 80,
    displayHeight: 20,
    help: 'Function to implement action.',
  }],
  ['Action', 'Method', function callIfEnabled(that) {
    if ( this.isEnabled.call(that) ) this.action.call(that, this);
  }],
  ['Action', 'Method', function install(model, proto) {
    var a = this;
    proto[this.name] = function() { a.callIfEnabled(this); };
  }],

  [null, 'Model', { name: 'Arg' }],
  ['Arg', 'Property', {
    name:  'type',
    type:  'String',
    required: true,
    displayWidth: 30,
    displayHeight: 1,
    defaultValue: 'Object',
    help: 'The type of this argument.'
  }],
  ['Arg', 'Property', {
    name: 'javaType',
    type: 'String',
    required: false,
    defaultValueFn: function() { return this.type; },
    help: 'The java type that represents the type of this property.'
  }],
  ['Arg', 'Property', {
    name: 'javascriptType',
    type: 'String',
    required: false,
    defaultValueFn: function() { return this.type; },
    help: 'The javascript type that represents the type of this property.'
  }],
  ['Arg', 'Property', {
    name:  'name',
    type:  'String',
    required: true,
    displayWidth: 30,
    displayHeight: 1,
    defaultValue: '',
    help: 'The coding identifier for the entity.'
  }],
  ['Arg', 'Property', {
    model_: 'BooleanProperty',
    name: 'required',
    defaultValue: true
  }],
  ['Arg', 'Property', {
    name: 'defaultValue',
    help: 'Default Value if not required and not provided.'
  }],
  ['Arg', 'Property', {
    name: 'description',
    type: 'String',
    displayWidth: 70,
    displayHeight: 1,
    defaultValue: '',
    help: 'A brief description of this topic.'
  }],
  ['Arg', 'Property', {
    name: 'help',
    label: 'Help Text',
    type: 'String',
    displayWidth: 70,
    displayHeight: 6,
    defaultValue: '',
    help: 'Help text associated with the entity.'
  }],
  ['Arg', 'Method', function decorateFunction(f, i) {
    if ( this.type === 'Object' ) return f;
    var type = this.type;

    return this.required ?
      function() {
        if ( arguments[i] === undefined ) {
          console.assert(false, 'Missing required argument# ' + i);
          debugger;
        }
        if ( typeof arguments[i] !== type ) {
          console.assert(false,  'argument# ' + i + ' type expected to be ' + type + ', but was ' + (typeof arguments[i]) + ': ' + arguments[i]);
          debugger;
        }

        return f.apply(this, arguments);
      } :
    function() {
      if ( arguments[i] !== undefined && typeof arguments[i] !== type ) {
        console.assert(false,  'argument# ' + i + ' type expected to be ' + type + ', but was ' + (typeof arguments[i]) + ': ' + arguments[i]);
        debugger;
      }

      return f.apply(this, arguments);
    } ;
  }],

  [null, 'Model', {
    name: 'Listener'
  }],
  ['Listener', 'Extends', 'Method'],
  ['Listener', 'Property', {
    name: 'isMerged',
    help: 'Should this listener be merged?'
  }],
  ['Listener', 'BooleanProperty', {
    name: 'isAnimated',
    help: 'As a listener, should this be animated?',
    defaultValue: false
  }],
  ['Listener', 'Method', function install(model, proto) {
    var name = this.name;
    var fn = this.code;
    var isAnimated = this.isAnimated;
    var isMerged = this.isMerged;

    Object.defineProperty(proto, name, {
      get: function() {
        var l = fn.bind(this);
        if ( isAnimated )
          l = EventService.animate(l);
        else if ( isMerged )
          l = EventService.merged(l, (isMerged === true) ? undefined : isMerged);

        Object.defineProperty(this, name, { value: l });
        return l
      },
      configurable: true
    });
  }],

  [null, 'Model', {
    name: 'Template',
    tableProperties: [
      'name', 'description'
    ]
  }],
  ['Template', 'Property', {
    name:  'name',
    type:  'String',
    required: true,
    displayWidth: 30,
    displayHeight: 1,
    defaultValue: '',
    help: 'The template\'s unique name.'
  }],
  ['Template', 'Property', {
    name:  'description',
    type:  'String',
    required: true,
    displayWidth: 70,
    displayHeight: 1,
    defaultValue: '',
    help: 'The template\'s unique name.'
  }],
  ['Template', 'Property', {
    name: 'template',
    type: 'String',
    displayWidth: 180,
    displayHeight: 30,
    rows: 30, cols: 80,
    defaultValue: '',
    view: 'TextAreaView',
    help: 'Template text. <%= expr %> or <% out(...); %>'
  }],
  /*['Template', 'Property', {
    name: 'templates',
    type: 'Array[Template]',
    subType: 'Template',
    view: 'ArrayView',
    defaultValue: [],
    help: 'Sub-templates of this template.'
    }]*/
  // Model pseudo-properties for backwards compatability.
  ['Model', 'Property', {
    name: 'properties',
    getter: function() {
      var ret = [];
      this.features.forEach(function(f) {
        if ( Property.isInstance(f) ) { ret.push(f); }
      });
      return ret;
    },
    setter: function(value) {
      for ( var i = 0; i < value.length; i++ ) {
        if ( ! Property.isInstance(value[i]) )
          value[i] = Property.create(value[i]);
        this.features.add(value[i]);
      }
    }
  }],
  ['Model', 'Property', {
    name: 'extendsModel',
    getter: function() {
      var value;
      this.features.forEach(function(f) {
        if ( Extends.isInstance(f) ) value = f.parent;
      });
      return value;
    },
    setter: function(value) {
      var feature = Extends.create({ parent: value });
      this.features.add(feature);
    }
  }],
  ['Model', 'Property', {
    name: 'methods',
    getter: function() {
      var ret = [];
      this.features.forEach(function(f) {
        if ( Method.isInstance(f) ) { ret.push(f); }
      });
      return ret;
    },
    setter: function(methods) {
      if ( Array.isArray(methods) ) {
        for ( var i = 0; i < methods.length; i++ ) {
          if ( ! Method.isInstance(methods[i]) )
            methods[i] = Method.create(methods[i]);
          this.features.add(methods[i]);
        }
      } else {
        for ( var method in methods ) {
          var m = Method.create({
            name: method,
            code: methods[method]
          });
          this.features.add(m);
        }
      }
    }
  }],
  ['Model', 'Property', {
    name: 'listeners',
    getter: function() {
      var ret = [];
      this.features.forEach(function(f) {
        if ( Listener.isInstance(f) ) { ret.push(f); }
      });
      return ret;
    },
    setter: function(listeners) {
      if ( Array.isArray(listeners) ) {
        for ( var i = 0; i < listeners.length; i++ ) {
          if ( ! Listener.isInstance(listeners[i]) )
            listeners[i] = Listener.create(listeners[i]);
          this.features.add(listeners[i]);
        }
      } else {
        for ( var method in listeners ) {
          var m = Listener.create({
            name: method,
            code: listeners[method]
          });
          this.features.add(m);
        }
      }
    }
  }],
  ['Model', 'StringArrayProperty', {
    name: 'tableProperties',
    valueFactory: function() {
      return this.properties.map(Property.NAME.f.bind(Property.NAME));
    }
  }],
  ['Model', 'Property', {
    name: 'actions',
    type: 'Array',
    subType: 'Action',
    getter: function() {
      var ret = [];
      // TODO sould this be a local forEach?
      this.features.localForEach(function(f) {
        if ( Action.isInstance(f) ) ret.push(f);
      });
      return ret;
    },
    setter: function(value) {
      for ( var i = 0; i < value.length; i++ ) {
        if ( ! Action.isInstance(value[i]) )
          value[i] = Action.create(value[i]);
        this.features.add(value[i]);
      }
    }
  }],
  ['Model', 'ArrayProperty', {
    name: 'models',
    subType: 'Model',
    getter: function() {
      var ret = [];
      // TODO sould this be a local forEach?
      this.features.localForEach(function(f) {
        if ( Model.isInstance(f) ) ret.push(f);
      });
      return ret;
    },
    setter: function(value) {
      for ( var i = 0; i < value.length; i++ ) {
        if ( ! Model.isInstance(value[i]) )
          value[i] = Model.create(value[i]);
        this.features.add(value[i]);
      }
    }
  }],
];

function lookup(address, scope) {
  if ( ! address ) return scope;

  var split = address.split('.');
  for ( var i = 0; i < split.length && scope; i++ ) {
    scope = scope.get ? scope.get(split[i]) : scope[split[i]];
  }
  return scope;
}

function build(scope, features) {
  for ( var i = 0 ; i < features.length ; i++ ) {
    var f = features[i];
    if (f[3]) debugger;

    var model = lookup(f[0], scope);
    if ( ! model ) throw "Model not found: " + f[0];

    var feature = lookup(f[1], scope);
    if ( !feature ) throw "Feature not found: " + f[1];

    var args = f[2];
    var feature = feature.create(args);
    model.addFeature(feature);
  }
}

(function() {
  var scope = window;
  scope.set = function(key, value) { this[key] = value; };
  scope.get = function(key) { return this[key]; };
  scope.features = FeatureSet.create();
  bootstrap(scope);
  build(scope, featureDAO);
})();
