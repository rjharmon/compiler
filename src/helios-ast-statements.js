//@ts-check
// Helios AST statements

import {
    TAB
} from "./config.js";

import {
    assertClass,
	assertDefined
} from "./utils.js";

/**
 * @typedef {import("./tokens.js").IRDefinitions} IRDefinitions
 */

import {
	BoolLiteral,
    IR,
    Site,
    Token,
    Word
} from "./tokens.js";

import {
	UplcData
} from "./uplc-data.js";

import {
	UplcValue
} from "./uplc-ast.js";

import {
	ArgType,
    BoolType,
    ByteArrayType,
    EvalEntity,
    ConstStatementInstance,
    EnumMemberStatementType,
    EnumStatementType,
    FuncStatementInstance,
    FuncType,
    Instance,
	Namespace,
    RawDataType,
    StatementType,
    Type,
    StructStatementType,
	ParametricFuncStatementInstance
} from "./helios-eval-entities.js";

import {
    FuncStatementScope,
    ModuleScope,
    Scope,
    TopScope
} from "./helios-scopes.js";

import {
	FuncArg,
    FuncLiteralExpr,
    LiteralDataExpr,
    NameTypePair,
    PrimitiveLiteralExpr,
    StructLiteralExpr,
    TypeExpr,
	TypeParameters,
    TypeRefExpr,
    ValueExpr
} from "./helios-ast-expressions.js";

import {
	buildLiteralExprFromJson,
	buildLiteralExprFromValue
} from "./helios-param.js";

/**
 * Base class for all statements
 * Doesn't return a value upon calling eval(scope)
 * @package
 */
export class Statement extends Token {
	#name;
	#used;
	#basePath; // set by the parent Module

	/**
	 * @param {Site} site 
	 * @param {Word} name 
	 */
	constructor(site, name) {
		super(site);
		this.#name = name;
		this.#used = false;
		this.#basePath = "__user";
	}

	/**
	 * @param {string} basePath 
	 */
	setBasePath(basePath) {
		this.#basePath = basePath;
	}

	get path() {
		return `${this.#basePath}__${this.name.toString()}`;
	}

	/**
	 * @type {Word}
	 */
	get name() {
		return this.#name;
	}

	/**
	 * @type {boolean}
	 */
	get used() {
		return this.#used;
	}

	/**
	 * @param {ModuleScope} scope 
	 */
	eval(scope) {
		throw new Error("not yet implemented");
	}

	use() {
		this.#used = true;
	}

	/**
	 * @param {Uint8Array} mask
	 */
	hideUnused(mask) {
		if (!this.#used) {
			if (this.site.endSite === null) {
				mask.fill(0, this.site.startPos);
			} else {
				mask.fill(0, this.site.startPos, this.site.endSite.startPos);
			}
		}
	}

	/**
	 * Returns IR of statement.
	 * No need to specify indent here, because all statements are top-level
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		throw new Error("not yet implemented");
	}
}

/**
 * Each field in `import {...} from <ModuleName>` is given a separate ImportFromStatement
 * @package
 */
export class ImportFromStatement extends Statement {
	#origName;
	#moduleName;

	/** 
	 * @type {Statement | null} 
	 */
	#origStatement;

	/**
	 * @param {Site} site 
	 * @param {Word} name
	 * @param {Word} origName
	 * @param {Word} moduleName
	 */
	constructor(site, name, origName, moduleName) {
		super(site, name);
		this.#origName = origName;
		this.#moduleName = moduleName;
		this.#origStatement = null;
	}

	/**
	 * @type {Word}
	 */
	get moduleName() {
		return this.#moduleName;
	}

	/**
	 * Returns null if import is another Namespace
	 * @type {Statement | null}
	 */
	get origStatement() {
		return this.#origStatement;
	}

	/**
	 * @param {ModuleScope} scope
	 * @returns {EvalEntity}
	 */
	evalInternal(scope) {
		let importedScope = scope.getScope(this.#moduleName);

		let importedEntity = importedScope.get(this.#origName);

		if (importedEntity instanceof Scope) {
			throw this.#origName.typeError(`can't import a module from a module`);
		} else {
			return importedEntity;
		}
	}

	/**
	 * @param {ModuleScope} scope 
	 */
	eval(scope) {
		let v = this.evalInternal(scope);

		if (v instanceof FuncStatementInstance || v instanceof ParametricFuncStatementInstance || v instanceof ConstStatementInstance || v instanceof StatementType) {
			this.#origStatement = assertClass(v.statement, Statement);
		}

		scope.set(this.name, v);
	}

	use() {
		super.use();
	}

	/**
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		// import statements only have a scoping function and don't do anything to the IR
	}
}

/**
 * `import <ModuleName>`
 * @package
 */
export class ImportModuleStatement extends Statement {
	/**
	 * @type {Map<string, EvalEntity>}
	 */
	#imported;

	/**
	 * @param {Site} site 
	 * @param {Word} moduleName
	 */
	constructor(site, moduleName) {
		super(site, moduleName);
		this.#imported = new Map();
	}

	/**
	 * @type {Word}
	 */
	get moduleName() {
		return this.name;
	}

	/**
	 * @param {ModuleScope} scope
	 * @returns {EvalEntity}
	 */
	evalInternal(scope) {
		let importedScope = scope.getScope(this.name);

		return new Namespace({
			/**
			 * @param {Word} name 
			 * @returns {EvalEntity}
			 */
			get: (name) => {
				const v = assertClass(importedScope, Scope).get(name);

				if (v instanceof Scope)	{
					throw name.typeError("unexpected scope");
				} else {
					this.#imported.set(name.value, v);
					
					return v;
				}
			}
		});	
	}

	/**
	 * @param {ModuleScope} scope 
	 */
	eval(scope) {
		let v = this.evalInternal(scope);

		scope.set(this.name, v);
	}

	use() {
		super.use();

		// actual use is handled by wherever imported variables/types are called/used
	}

	/**
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		// import statements only have a scoping function and don't do anything to the IR
	}
}

/**
 * Const value statement
 * @package
 */
export class ConstStatement extends Statement {
	/**
	 * @type {?TypeExpr}
	 */
	#typeExpr;

	/**
	 * @type {ValueExpr}
	 */
	#valueExpr;

	/**
	 * @param {Site} site 
	 * @param {Word} name 
	 * @param {?TypeExpr} typeExpr - can be null in case of type inference
	 * @param {ValueExpr} valueExpr 
	 */
	constructor(site, name, typeExpr, valueExpr) {
		super(site, name);
		this.#typeExpr = typeExpr;
		this.#valueExpr = valueExpr;
	}

	get type() {
		if (this.#typeExpr === null) {
			return this.#valueExpr.type;
		} else {
			return this.#typeExpr.type;
		}
	}

	/**
	 * @param {string | UplcValue} value 
	 */
	changeValue(value) {
		let type = this.type;
		let site = this.#valueExpr.site;

		if (typeof value == "string") {
			this.#valueExpr = buildLiteralExprFromJson(site, type, JSON.parse(value), this.name.value);
		} else {
			this.#valueExpr = buildLiteralExprFromValue(site, type, value, this.name.value);
		}
	}

	/**
	 * Use this to change a value of something that is already typechecked.
	 * @param {UplcData} data
	 */
	changeValueSafe(data) {
		const type = this.type;
		const site = this.#valueExpr.site;

		if ((new BoolType()).isBaseOf(type)) {
			this.#valueExpr = new PrimitiveLiteralExpr(new BoolLiteral(site, data.index == 1));
		} else {
			this.#valueExpr = new LiteralDataExpr(site, type, data);
		}
	}

	/**
	 * @returns {string}
	 */
	toString() {
		return `const ${this.name.toString()}${this.#typeExpr === null ? "" : ": " + this.#typeExpr.toString()} = ${this.#valueExpr.toString()};`;
	}

	/**
	 * @param {Scope} scope 
	 * @returns {Instance}
	 */
	evalInternal(scope) {
		let value = this.#valueExpr.eval(scope);

		/** @type {Type} */
		let type;

		if (this.#typeExpr === null) {
			if (!this.#valueExpr.isLiteral()) {
				throw this.typeError("can't infer type");
			}

			type = this.#valueExpr.type;
		} else {
			type = this.#typeExpr.eval(scope);

			if (!value.isInstanceOf(type)) {
				throw this.#valueExpr.typeError("wrong type");
			}
		}

		return new ConstStatementInstance(type, this);
	}

	/**
	 * Evaluates rhs and adds to scope
	 * @param {TopScope} scope 
	 */
	eval(scope) {
		scope.set(this.name, this.evalInternal(scope));
	}

	use() {
		if (!this.used) {
			super.use();

			this.#valueExpr.use();

			if (this.#typeExpr !== null) {
				this.#typeExpr.use();
			}
		}
	}

	/**
	 * @returns {IR}
	 */
	toIRInternal() {
		return new IR([
			new IR("const(", this.site),
			this.#valueExpr.toIR(),
			new IR(")")
		])
		
	}

	/**
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		map.set(this.path, this.toIRInternal());
	}
}

/**
 * Single field in struct or enum member
 * @package
 */
export class DataField extends NameTypePair {
	/**
	 * @param {Word} name 
	 * @param {TypeExpr} typeExpr 
	 */
	constructor(name, typeExpr) {
		super(name, typeExpr);
	}
}

/**
 * Base class for struct and enum member
 * @package
 */
export class DataDefinition extends Statement {
	#fields;

	/** @type {Set<string>} */
	#usedAutoMethods;

	/**
	 * @param {Site} site 
	 * @param {Word} name 
	 * @param {DataField[]} fields 
	 */
	constructor(site, name, fields) {
		super(site, name);
		this.#fields = fields;
		this.#usedAutoMethods = new Set();
	}

	/**
	 * @type {Type}
	 */
	get type() {
		throw new Error("not yet implemented");
	}

	get fields() {
		return this.#fields.slice();
	}

	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	getConstrIndex(site) {
		throw new Error("not yet implemented");
	}

	/**
	 * Returns index of a field.
	 * Returns -1 if not found.
	 * @param {Word} name 
	 * @returns {number}
	 */
	findField(name) {
		let found = -1;
		let i = 0;
		for (let f of this.#fields) {
			if (f.name.toString() == name.toString()) {
				found = i;
				break;
			}
			i++;
		}

		return found;
	}

	/**
	 * @param {Word} name 
	 * @returns {boolean}
	 */
	hasField(name) {
		return this.findField(name) != -1;
	}

	/**
	 * @param {Word} name 
	 * @returns {boolean}
	 */
	hasMember(name) {
		return this.hasField(name) || name.value == "copy";
	}

	/**
	 * @returns {string}
	 */
	toStringFields() {
		return `{${this.#fields.map(f => f.toString()).join(", ")}}`;
	}

	/**
	 * @returns {string}
	 */
	toString() {
		return `${this.name.toString()} ${this.toStringFields()}`;
	}

	/**
	 * @param {Scope} scope
	 */
	evalInternal(scope) {
		for (let f of this.#fields) {
			let fieldType = f.evalType(scope);

			if (fieldType instanceof FuncType) {
				throw f.site.typeError("field can't be function type");
			}
		}
	}

	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	nFields(site) {
		return this.#fields.length;
	}

	/**
	 * @param {Site} site 
	 * @param {number} i 
	 * @returns {Type}
	 */
	getFieldType(site, i) {
		return this.#fields[i].type;
	}

	/**
	 * @param {Site} site 
	 * @param {string} name 
	 * @returns {number}
	 */
	getFieldIndex(site, name) {
		const i = this.findField(new Word(Site.dummy(), name));

		if (i == -1) {
			throw site.typeError(`field ${name} not find in ${this.toString()}`);
		} else {
			return i;
		}
	}

	/**
	 * @param {number} i
	 * @returns {string}
	 */
	getFieldName(i) {
		return this.#fields[i].name.toString();
	}
	
	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	nEnumMembers(site) {
		throw site.typeError(`'${this.name.value}' isn't an enum type`);
	}

	/**
	 * @param {Word} name 
	 * @returns {EvalEntity}
	 */
	getTypeMember(name) {
		if (this.hasField(name)) {
			throw name.referenceError(`'${this.name.toString()}::${name.toString()}' undefined (did you mean '${this.name.toString()}.${name.toString()}'?)`);
		} else {
			throw name.referenceError(`'${this.name.toString()}::${name.toString()}' undefined`);
		}
	}

	/**
	 * Gets insance member value.
	 * If dryRun == true usage is triggered
	 * @param {Word} name 
	 * @param {boolean} dryRun 
	 * @returns {Instance}
	 */
	getInstanceMember(name, dryRun = false) {
		switch (name.value) {
			case "copy":
				this.#usedAutoMethods.add(name.value);
				return Instance.new(new FuncType(this.#fields.map(f => new ArgType(f.name, f.type, true)), this.type));
			default:
				let i = this.findField(name);

				if (i == -1) {
					throw name.referenceError(`'${this.name.toString()}.${name.toString()}' undefined`);
				} else {
					return Instance.new(this.#fields[i].type);
				}
		}
		
	}

	use() {
		if (!this.used) {
			super.use();
			
			for (let f of this.#fields) {
				f.use();
			}
		}
	}

	/**
	 * @package
	 * @param {IRDefinitions} map 
	 * @param {string[]} getterNames
	 */
	copyToIR(map, getterNames) {
		const key = `${this.path}__copy`;

		// using existing IR generators as much as possible

		let ir = StructLiteralExpr.toIRInternal(this.site, this.type, this.#fields.map(df => new IR(df.name.value)), this.getConstrIndex(this.site));

		// wrap with defaults

		for (let i = getterNames.length - 1; i >= 0; i--) {
			const fieldName = this.#fields[i].name.toString();

			ir = FuncArg.wrapWithDefaultInternal(ir, fieldName, new IR([
				new IR(getterNames[i]),
				new IR("(self)")
			]))
		}

		ir = new IR([
			new IR("(self) -> {"),
			new IR("("),
			new IR(this.#fields.map(f => new IR(`__useopt__${f.name.toString()}, ${f.name.toString()}`))).join(", "),
			new IR(") -> {"),
			ir,
			new IR("}}")
		]);

		map.set(key, ir);
	}

	/**
	 * Doesn't return anything, but sets its IRdef in the map
	 * @param {IRDefinitions} map
	 * @param {boolean} isConstr
	 */
	toIR(map, isConstr = true) {
		const getterBaseName = isConstr ? "__helios__common__field" : "__helios__common__tuple_field";

		/**
		 * @type {string[]}
		 */
		const getterNames = [];

		// add a getter for each field
		for (let i = 0; i < this.#fields.length; i++) {
			let f = this.#fields[i];
			let key = `${this.path}__${f.name.toString()}`;
			getterNames.push(key);
			let isBool = f.type instanceof BoolType;

			/**
			 * @type {IR}
			 */
			let getter;

			if (i < 20) {

				getter = new IR(`${getterBaseName}_${i}`, f.site);

				if (isBool) {
					getter = new IR([
						new IR("(self) "), new IR("->", f.site), new IR(" {"),
						new IR(`__helios__common__unBoolData(${getterBaseName}_${i}(self))`),
						new IR("}"),
					]);
				}
			} else {
				let inner = isConstr ? new IR("__core__sndPair(__core__unConstrData(self))") : new IR("__core__unListData(self)");

				for (let j = 0; j < i; j++) {
					inner = new IR([new IR("__core__tailList("), inner, new IR(")")]);
				}

				inner = new IR([
					new IR("__core__headList("),
					inner,
					new IR(")"),
				]);

				if (isBool) {
					inner = new IR([new IR("__helios__common__unBoolData("), inner, new IR(")")]);
				}

				getter = new IR([
					new IR("(self) "), new IR("->", f.site), new IR(" {"),
					inner,
					new IR("}"),
				]);
			}

			map.set(key, getter)
		}

		if (this.#usedAutoMethods.has("copy")) {
			this.copyToIR(map, getterNames);
		}
	}
}

/**
 * Struct statement
 * @package
 */
export class StructStatement extends DataDefinition {
	#parameters;
	#impl;

	/**
	 * @param {Site} site
	 * @param {Word} name
	 * @param {TypeParameters} parameters
	 * @param {DataField[]} fields 
	 * @param {ImplDefinition} impl
	 */
	constructor(site, name, parameters, fields, impl) {
		super(site, name, fields);

		this.#parameters = parameters;
		this.#impl = impl;
	}

	/**
	 * @type {StructStatementType}
	 */
	get type() {
		return new StructStatementType(this);
	}

	/**
	 * @returns {string}
	 */
	toString() {
		return `struct ${this.name.toString()}${this.#parameters.toString()} ${this.toStringFields()}`;
	}

	/**
	 * Returns -1, which means -> don't use ConstrData, but use []Data directly
	 * @param {Site} site 
	 * @returns {number}
	 */
	getConstrIndex(site) {
		return -1;
	}

	/**
	 * Evaluates own type and adds to scope
	 * @param {TopScope} scope 
	 */
	eval(scope) {
		if (scope.isStrict() && this.fields.length == 0) {
			throw this.syntaxError("expected at least 1 struct field");
		}

		// add before so recursive types are possible
		scope.set(this.name, this.type);

		this.evalInternal(scope);

		// check the types of the member methods
		this.#impl.eval(scope);
	}

	/**
	 * @param {Word} name 
	 * @param {boolean} dryRun 
	 * @returns {Instance}
	 */
	getInstanceMember(name, dryRun = false) {
		if (super.hasMember(name)) {
			return super.getInstanceMember(name, dryRun);
		} else {
			return this.#impl.getInstanceMember(name, dryRun);
		}
	}

	/**
	 * @param {Word} name
	 * @param {boolean} dryRun
	 * @returns {EvalEntity}
	 */
	getTypeMember(name, dryRun = false) {
		// only the impl can contain potentially contain type members
		return this.#impl.getTypeMember(name, dryRun);
	}

	/**
	 * @param {Uint8Array} mask
	 */
	hideUnused(mask) {
		super.hideUnused(mask);

		this.#impl.hideUnused(mask);
	}

	/**
	 * @param {IRDefinitions} map
	 */
	toIR(map) {
		if (this.fields.length == 1) {
			let f = this.fields[0];
			let key = `${this.path}__${f.name.toString()}`;
			let isBool = f.type instanceof BoolType;

			if (isBool) {
				map.set(key, new IR("__helios__common__unBoolData", f.site));
			} else {
				map.set(key, new IR("__helios__common__identity", f.site));
			}
		} else {
			super.toIR(map, false);
		}

		this.#impl.toIR(map);
	}
}

/**
 * Function statement
 * (basically just a named FuncLiteralExpr)
 * @package
 */
export class FuncStatement extends Statement {
	#funcExpr;
	#recursive;

	/**
	 * @param {Site} site 
	 * @param {Word} name 
	 * @param {FuncLiteralExpr} funcExpr 
	 */
	constructor(site, name, funcExpr) {
		super(site, name);
		this.#funcExpr = funcExpr;
		this.#recursive = false;
	}

	/**
	 * @type {Type[]}
	 */
	get argTypes() {
		return this.#funcExpr.argTypes;
	}

	/**
	 * @type {string[]}
	 */
	get argTypeNames() {
		return this.#funcExpr.argTypeNames;
	}

	/**
	 * @type {Type[]}
	 */
	get retTypes() {
		return this.#funcExpr.retTypes;
	}

	toString() {
		return `func ${this.name.toString()}${this.#funcExpr.toString()}`;
	}

	/**
	 * Evaluates a function and returns a func value
	 * @param {Scope} scope 
	 * @returns {Instance}
	 */
	evalInternal(scope) {
		return this.#funcExpr.evalInternal(scope);
	}

	/**
	 * Evaluates type of a funtion.
	 * Separate from evalInternal so we can use this function recursively inside evalInternal
	 * @param {Scope} scope 
	 * @returns {FuncType}
	 */
	evalType(scope) {
		return this.#funcExpr.evalType(scope);
	}

	use() {
		if (!this.used) {
			super.use();

			this.#funcExpr.use();
		}
	}

	isRecursive() {
		return this.#recursive;
	}

	/**
	 * Called in FuncStatementScope as soon as recursion is detected
	 */
	setRecursive() {
		this.#recursive = true;
	}

	/**
	 * @param {Scope} scope 
	 */
	eval(scope) {
		// add to scope before evaluating, to allow recursive calls

		let fnType = this.evalType(scope);

		let fnVal = this.#funcExpr.hasParameters() ?
			new ParametricFuncStatementInstance(this.#funcExpr.parameters, fnType, this) :
			new FuncStatementInstance(fnType, this);

		scope.set(this.name, fnVal);

		void this.#funcExpr.evalInternal(new FuncStatementScope(scope, this));
	}

	/**
	 * Returns IR of function.
	 * @param {string} fullName - fullName has been prefixed with a type path for impl members
	 * @returns {IR}
	 */
	toIRInternal(fullName = this.path) {
		if (this.#recursive) {
			return this.#funcExpr.toIRRecursive(fullName, TAB);
		} else {
			return this.#funcExpr.toIR(TAB);
		}
	}

	/**
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		map.set(this.path, this.toIRInternal());
	}

	/**
	 * @param {Statement} s 
	 * @returns {boolean}
	 */
	static isMethod(s) {
		if (s instanceof FuncStatement) {
			return s.#funcExpr.isMethod();
		} else {
			return false;
		}
	}
}

/**
 * EnumMember defintion is similar to a struct definition
 * @package
 */
export class EnumMember extends DataDefinition {
	/** @type {?EnumStatement} */
	#parent;

	/** @type {?number} */
	#constrIndex;

	/**
	 * @param {Word} name
	 * @param {DataField[]} fields
	 */
	constructor(name, fields) {
		super(name.site, name, fields);
		this.#parent = null; // registered later
		this.#constrIndex = null;
	}

	/** 
	 * @param {EnumStatement} parent
	 * @param {number} i
	*/
	registerParent(parent, i) {
		this.#parent = parent;
		this.#constrIndex = i;
	}
	
	/**
	 * @type {EnumStatement}
	 */
	get parent() {
		if (this.#parent === null) {
			throw new Error("parent not yet registered");
		} else {
			return this.#parent;
		}
	}

	get type() {
		return new EnumMemberStatementType(this);
	}

	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	getConstrIndex(site) {
		if (this.#constrIndex === null) {
			throw new Error("constrIndex not set");
		} else {
			return this.#constrIndex;
		}
	}

	/**
	 * @param {Scope} scope 
	 */
	eval(scope) {
		if (this.#parent === null) {
			throw new Error("parent should've been registered");
		}

		super.evalInternal(scope); // the internally created type isn't be added to the scope. (the parent enum type takes care of that)
	}

	/**
	 * @param {Word} name 
	 * @param {boolean} dryRun 
	 * @returns {Instance}
	 */
	getInstanceMember(name, dryRun = false) {
		if (this.hasField(name)) {
			return super.getInstanceMember(name, dryRun);
		} else {
			if (this.#parent === null) {
				throw new Error("parent should've been registered");
			} else {
				return this.#parent.getInstanceMember(name, dryRun);
			}
		}
	}

	get path() {
		return `${this.parent.path}__${this.name.toString()}`;
	}
}

/**
 * Enum statement, containing at least one member
 * @package
 */
export class EnumStatement extends Statement {
	#parameters;
	#members;
	#impl;

	/**
	 * @param {Site} site 
	 * @param {Word} name 
	 * @param {TypeParameters} parameters
	 * @param {EnumMember[]} members 
	 * @param {ImplDefinition} impl
	 */
	constructor(site, name, parameters, members, impl) {
		super(site, name);
		this.#parameters = parameters;
		this.#members = members;
		this.#impl = impl;
		
		for (let i = 0; i < this.#members.length; i++) {
			this.#members[i].registerParent(this, i);
		}
	}

	get type() {
		return new EnumStatementType(this);
	}

	/**
	 * Returns index of enum member.
	 * Returns -1 if not found
	 * @param {Word} name 
	 * @returns {number}
	 */
	// returns an index
	findEnumMember(name) {
		let found = -1;
		let i = 0;
		for (let member of this.#members) {
			if (member.name.toString() == name.toString()) {
				found = i;
				break;
			}
			i++;
		}

		return found;
	}

	/**
	 * @param {Site} site 
	 * @param {number} i
	 * @returns {EnumMember}
	 */
	getEnumMember(site, i) {
		return assertDefined(this.#members[i]);
	}

	/**
	 * @param {Word} name
	 * @returns {boolean}
	 */
	hasEnumMember(name) {
		return this.findEnumMember(name) != -1;
	}

	toString() {
		return `enum ${this.name.toString()}${this.#parameters.toString()} {${this.#members.map(m => m.toString()).join(", ")}}`;
	}

	/**
	 * @param {Scope} scope 
	 */
	eval(scope) {
		scope.set(this.name, this.type);

		this.#members.forEach(m => {
			m.eval(scope);
		});

		this.#impl.eval(scope);
	}

	use() {
		if (!this.used) {
			super.use();

			for (let m of this.#members) {
				m.use();
			}
		}
	}

	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	nFields(site) {
		throw site.typeError("enum doesn't have fields");
	}

	/**
	 * @param {Site} site
	 * @param {number} i
	 * @returns {Type}
	 */
	getFieldType(site, i) {
		throw site.typeError("enum doesn't have fields");
	}

	/**f
	 * @param {Site} site 
	 * @param {string} name 
	 * @returns {number}
	 */
	getFieldIndex(site, name) {
		throw site.typeError("enum doesn't have fields");
	}

	/**
	 * @param {number} i 
	 * @returns {string}
	 */
	getFieldName(i) {
		throw Site.dummy().typeError("enum doesn't have fields");
	}
	
    /**
     * @param {Word} name 
     * @returns {boolean}
     */
    hasField(name) {
        throw name.site.typeError("enum doesn't have fields");
    }

	/** 
	 * @param {Word} name 
	 * @param {boolean} dryRun 
	 * @returns {Instance}
	 */
	getInstanceMember(name, dryRun = false) {
		if (this.hasEnumMember(name)) {
			throw name.referenceError(`'${name.toString()}' is an enum of '${this.toString}' (did you mean '${this.toString()}::${name.toString()}'?)`);
		} else {
			return this.#impl.getInstanceMember(name, dryRun);
		}
	}

	/**
	 * @param {Word} name 
	 * @param {boolean} dryRun
	 * @returns {EvalEntity}
	 */
	getTypeMember(name, dryRun = false) {
		let i = this.findEnumMember(name);
		if (i == -1) {
			return this.#impl.getTypeMember(name, dryRun);
		} else {
			return this.#members[i].type;
		}
	}

	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	getConstrIndex(site) {
		throw site.typeError("can't construct an enum directly (cast to a concrete type first)");
	}

	/**
	 * @param {Site} site 
	 * @returns {number}
	 */
	nEnumMembers(site) {
		return this.#members.length;
	}

	/**
	 * @param {Uint8Array} mask
	 */
	hideUnused(mask) {
		super.hideUnused(mask);

		this.#impl.hideUnused(mask);
	}

	/**
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		for (let member of this.#members) {
			member.toIR(map);
		}

		this.#impl.toIR(map);
	}
}

/**
 * Impl statements, which add functions and constants to registry of user types (Struct, Enum Member and Enums)
 * @package
 */
export class ImplDefinition {
	#selfTypeExpr;
	#statements;

	/** @type {Instance[]} - filled during eval to allow same recursive behaviour as for top-level statements */
	#statementValues;

	/** @type {Set<string>} */
	#usedStatements;

	/**
	 * @param {TypeRefExpr} selfTypeExpr;
	 * @param {(FuncStatement | ConstStatement)[]} statements 
	 */
	constructor(selfTypeExpr, statements) {
		this.#selfTypeExpr = selfTypeExpr;
		this.#statements = statements;
		this.#statementValues = [];
		this.#usedStatements = new Set(); // used for code-generation, but not for cleanSource filtering
	}

	toString() {
		return `${this.#statements.map(s => s.toString()).join("\n")}`;
	}

	/**
	 * @param {Scope} scope 
	 */
	eval(scope) {
		let selfType = this.#selfTypeExpr.eval(scope);

		if (!(selfType instanceof StatementType)) {
			throw this.#selfTypeExpr.referenceError("not a user-type");
		} else {
			for (let s of this.#statements) {
				if (s instanceof FuncStatement) {
					// override eval() of FuncStatement because we don't want the function to add itself to the scope directly.
					let v = new FuncStatementInstance(s.evalType(scope), s);

					this.#statementValues.push(v); // add func type to #statementValues in order to allow recursive calls (acts as a special scope)

					// eval internal doesn't add anything to scope
					void s.evalInternal(new FuncStatementScope(scope, s));
				} else {
					// eval internal doesn't add anything to scope
					this.#statementValues.push(s.evalInternal(scope));
				}
			}
		}
	}

	/**
	 * @param {Word} name
	 * @param {boolean} dryRun
	 * @returns {Instance}
	 */
	getInstanceMember(name, dryRun = false) {
		switch (name.value) {
			case "serialize":
				this.#usedStatements.add(name.toString());
				return Instance.new(new FuncType([], new ByteArrayType()));
			
			default:
				// loop the contained statements to find one with name 'name'
				for (let i = 0; i < this.#statementValues.length; i++) {
					let s = this.#statements[i];

					if (name.toString() == s.name.toString()) {
						if (FuncStatement.isMethod(s)) {
							if (!dryRun) {
								this.#usedStatements.add(name.toString());
							}

							return this.#statementValues[i];
						} else {
							throw name.referenceError(`'${this.#selfTypeExpr.toString()}.${name.toString()}' isn't a method (did you mean '${this.#selfTypeExpr.toString()}::${name.toString()}'?)`);
						}
					}
				}

				throw name.referenceError(`'${this.#selfTypeExpr.toString()}.${name.toString()}' undefined`);
		}
	}
	
	/**
	 * @param {Word} name 
	 * @param {boolean} dryRun 
	 * @returns {EvalEntity}
	 */
	getTypeMember(name, dryRun = false) {
		switch (name.value) {
			case "__eq":
			case "__neq":
				this.#usedStatements.add(name.toString());
				return Instance.new(new FuncType([this.#selfTypeExpr.type, this.#selfTypeExpr.type], new BoolType()));
			case "from_data":
				this.#usedStatements.add(name.toString());
				return Instance.new(new FuncType([new RawDataType()], this.#selfTypeExpr.type));
			default:
				for (let i = 0; i < this.#statementValues.length; i++) {
					let s = this.#statements[i];

					if (name.toString() == s.name.toString()) {
						if (FuncStatement.isMethod(s)) {
							throw name.referenceError(`'${this.#selfTypeExpr.toString()}::${name.value}' is a method (did you mean '${this.#selfTypeExpr.toString()}.${name.toString()}'?)`)
						} else {
							if (!dryRun) {
								this.#usedStatements.add(name.toString());
							}

							return this.#statementValues[i];
						}
					}
				}

				throw name.referenceError(`'${this.#selfTypeExpr.toString()}::${name.toString()}' undefined`);
		}
	}

	/**
	 * @param {Uint8Array} mask
	 */
	hideUnused(mask) {
		for (let s of this.#statements) {
			if (!s.used) {
				let site = s.site;

				if (site.endSite === null) {
					mask.fill(0, site.startPos);
				} else {
					mask.fill(0, site.startPos, site.endSite.startPos);
				}
			}
		}
	}

	/**
	 * Returns IR of all impl members
	 * @param {IRDefinitions} map 
	 */
	toIR(map) {
		let path = this.#selfTypeExpr.path;
		let site = this.#selfTypeExpr.site;

		if (this.#usedStatements.has("__eq")) {
			map.set(`${path}____eq`, new IR("__helios__common____eq", site));
		}

		if (this.#usedStatements.has("__neq")) {
			map.set(`${path}____neq`, new IR("__helios__common____neq", site));
		}

		if (this.#usedStatements.has("serialize")) {
			map.set(`${path}__serialize`, new IR("__helios__common__serialize", site));
		}

		if (this.#usedStatements.has("from_data")) {
			map.set(`${path}__from_data`, new IR("__helios__common__identity", site));
		}

		for (let s of this.#statements) {
			let key = `${path}__${s.name.toString()}`
			if (s instanceof FuncStatement) {
				map.set(key, s.toIRInternal(key));
			} else {
				map.set(key, s.toIRInternal());
			}
		}
	}
}