// L3-eval.ts

import { filter, map, reduce, zip } from "ramda";
import { isArray, isBoolean, isEmpty, isNumber, isString, LazyVarDecl, isLazyVarDecl, makeLazyVarDecl, isVarDecl } from "./L3-ast";
import { AppExp, AtomicExp, BoolExp, CompoundExp, CExp, DefineExp, Exp, IfExp, LitExp, NumExp,
         Parsed, PrimOp, ProcExp, Program, StrExp, VarDecl, VarRef } from "./L3-ast";
import { isAppExp, isBoolExp, isCExp, isDefineExp, isExp, isIfExp, isLetExp, isLitExp, isNumExp,
             isPrimOp, isProcExp, isProgram, isStrExp, isVarRef } from "./L3-ast";
import { makeAppExp, makeBoolExp, makeIfExp, makeLitExp, makeNumExp, makeProcExp, makeStrExp,
         makeVarDecl, makeVarRef } from "./L3-ast";
import { parseL3 } from "./L3-ast";
import { applyEnv, makeEmptyEnv, makeEnv, Env } from "./L3-env";
import { isClosure, isCompoundSExp, isEmptySExp, isSymbolSExp, isSExp,
         makeClosure, makeCompoundSExp, makeEmptySExp, makeSymbolSExp,
         Closure, CompoundSExp, SExp, Value } from "./L3-value";
import { getErrorMessages, hasNoError, isError }  from "./error";
import { allT, first, rest, second } from './list';
import { L3normalEval } from "./L3-normal";

// ========================================================
// Eval functions

const L3applicativeEval = (exp: CExp | Error, env: Env): Value | Error =>
    isError(exp)  ? exp :
    isNumExp(exp) ? exp.val :
    isBoolExp(exp) ? exp.val :
    isStrExp(exp) ? exp.val :
    isPrimOp(exp) ? exp :
    isVarRef(exp) ? applyEnv(env, exp.var) :
    isLitExp(exp) ? exp.val :
    isIfExp(exp) ? evalIf(exp, env) :
    isProcExp(exp) ? evalProc(exp, env) :
    //change here  to support lazy
    isAppExp(exp) ?  L3specialApplyProcedure(L3applicativeEval(exp.rator, env),
                                         exp.rands,
                                     env) :
    Error(`Bad L3 AST ${exp}`);
export const isTrueValue = (x: Value | Error): boolean | Error =>
    isError(x) ? x :
    ! (x === false);

const evalIf = (exp: IfExp, env: Env): Value | Error => {
    const test = L3applicativeEval(exp.test, env);
    return isError(test) ? test :
        isTrueValue(test) ? L3applicativeEval(exp.then, env) :
        L3applicativeEval(exp.alt, env);
};

const evalProc = (exp: ProcExp, env: Env): Value =>
    makeClosure(exp.args, exp.body);



const L3specialApplyProcedure = (proc: Value | Error, args: CExp[], env: Env): Value | Error =>{

    if(isError(proc)){
        return proc;
    }
    else if (isPrimOp(proc)) {
           return L3applyProcedure(proc,
                    map((rand) => L3applicativeEval(rand, env),args),env); 
    }
    else if(isClosure(proc)){
            // var i;
            // console.log("proc:")
            // console.log(proc);
            // console.log("body:")
            // console.log(proc.body);
        
            // console.log("args:")

            // for(i=0; i<args.length; i++){
            //     //console.log(proc.params[i])
            //     console.log(args[i]);
                
            // }

            //  zip params and args together. for each pair - if its a lazy - return the CExp. else, evaluate -> then return.
           
           
            const vars = map((p) => p.var, proc.params);
        
           
            const body = renameExps(proc.body);
            const evaled_some= zip(proc.params,args).map((param_arg)=> isLazyVarDecl(param_arg["0"]) ? param_arg["1"]  :  
            L3applicativeEval(param_arg["1"], env));
            
            if(!hasNoError(evaled_some))
                return Error(`Bad argument: ${getErrorMessages(args)}`)
                
         
            // var i;
            // for (i=0; i<evaled_some.length; i++){
            //     isCExp(evaled_some[i])? console.log("yes..") : console.log(valueToLitExp(evaled_some[i]));

            // }
           return L3applicativeEvalSeq(substitute(body, vars, evaled_some.map((x)=> isCExp(x)? x : valueToLitExp(x))), env);
           
        }
        else
            return  Error("Bad procedure " + JSON.stringify(proc))
}


const L3applicativeEvalSeq = (exps: CExp[], env: Env): Value | Error => {

    if (isEmpty(rest(exps)))
        return L3applicativeEval(first(exps), env);
    else {
        L3applicativeEval(first(exps), env);
        return L3applicativeEvalSeq(rest(exps), env);
    }
};

const L3applyProcedure = (proc: Value | Error, args: Array<Value | Error>, env: Env): Value | Error =>
    isError(proc) ? proc :
    !hasNoError(args) ? Error(`Bad argument: ${getErrorMessages(args)}`) :
    isPrimOp(proc) ? applyPrimitive(proc, args) :
    isClosure(proc) ? applyClosure(proc, args, env) :
    Error("Bad procedure " + JSON.stringify(proc))

const valueToLitExp = (v: Value): NumExp | BoolExp | StrExp | LitExp | PrimOp | ProcExp =>
    isNumber(v) ? makeNumExp(v) :
    isBoolean(v) ? makeBoolExp(v) :
    isString(v) ? makeStrExp(v) :
    isPrimOp(v) ? v :
    isClosure(v) ? makeProcExp(v.params, v.body) :
    makeLitExp(v);

// @Pre: none of the args is an Error (checked in applyProcedure)
const applyClosure = (proc: Closure, args: (Value | CExp)[], env: Env): Value | Error => {
    let vars = map((v: VarDecl | LazyVarDecl) => v.var, proc.params);
    let body = renameExps(proc.body);
    //let litArgs = map(valueToLitExp, args);
    let litArgs = map(valueToLitExp, map((arg)=>isCExp(arg) ? L3applicativeEval(arg, env) : arg ,args));    //if its an expression (was lazy) eval it.
    return evalExps(substitute(body, vars, litArgs), env);
}

// For applicative eval - the type of exps should be ValueExp[] | VarRef[];
// where ValueExp is an expression which directly encodes a value:
// export type ValueExp = LitExp | NumExp | BoolExp | StrExp | PrimOp;
// In order to support normal eval as well - we generalize the types to CExp.

// @Pre: vars and exps have the same length
export const substitute = (body: CExp[], vars: string[], exps: CExp[]): CExp[] => {  
    const subVarRef = (e: VarRef): CExp => {
        const pos = vars.indexOf(e.var);
        return ((pos > -1) ? exps[pos] : e);
    };
    const subProcExp = (e: ProcExp): ProcExp => {
        const argNames = map((x) => x.var, e.args);
        const subst = zip(vars, exps);
        const freeSubst = filter((ve) => argNames.indexOf(first(ve)) === -1, subst);
        return makeProcExp(e.args,
                           substitute(e.body, map(first, freeSubst), map(second, freeSubst)));
    };
    const sub = (e: CExp): CExp =>
        isNumExp(e) ? e :
        isBoolExp(e) ? e :
        isPrimOp(e) ? e :
        isLitExp(e) ? e :
        isStrExp(e) ? e :
        isVarRef(e) ? subVarRef(e) :
        isIfExp(e) ? makeIfExp(sub(e.test), sub(e.then), sub(e.alt)) :
        isProcExp(e) ? subProcExp(e) :
        isAppExp(e) ? makeAppExp(sub(e.rator), map(sub, e.rands)) :
        e;
    return map(sub, body);
}

/*
    Purpose: create a generator of new symbols of the form v__n
    with n incremented at each call.
*/
export const makeVarGen = (): (v: string) => string => {
    let count: number = 0;
    return (v: string) => {
        count++;
        return `${v}__${count}`;
    }
}

/*
Purpose: Consistently rename bound variables in 'exps' to fresh names.
         Start numbering at 1 for all new var names.
*/
export const renameExps = (exps: CExp[]): CExp[] => {
    const varGen = makeVarGen();
    const replace = (e: CExp): CExp =>
        isIfExp(e) ? makeIfExp(replace(e.test), replace(e.then), replace(e.alt)) :
        isAppExp(e) ? makeAppExp(replace(e.rator), map(replace, e.rands)) :
        isProcExp(e) ? replaceProc(e) :
        e;
    // Rename the params and substitute old params with renamed ones.
    //  First recursively rename all ProcExps inside the body.
    const replaceProc = (e: ProcExp): ProcExp => {
        const oldArgs = map((arg: (VarDecl | LazyVarDecl)): string => arg.var, e.args);
        const newArgs = map(varGen, oldArgs);
        const newBody = map(replace, e.body);
        const newDecs = zip(e.args,newArgs).map((pair)=>isLazyVarDecl(pair["0"]) ? makeLazyVarDecl(pair["1"]) : makeVarDecl(pair["1"]));


        return makeProcExp(newDecs,
                           substitute(newBody, oldArgs, map(makeVarRef, newArgs)));
    }
    return map(replace, exps);
}


// @Pre: none of the args is an Error (checked in applyProcedure)
export const applyPrimitive = (proc: PrimOp, args: Value[]): Value | Error =>
    proc.op === "+" ? (allT(isNumber, args) ? reduce((x, y) => x + y, 0, args) : Error("+ expects numbers only")) :
    proc.op === "-" ? minusPrim(args) :
    proc.op === "*" ? (allT(isNumber, args) ? reduce((x, y) => x * y, 1, args) : Error("* expects numbers only")) :
    proc.op === "/" ? divPrim(args) :
    proc.op === ">" ? args[0] > args[1] :
    proc.op === "<" ? args[0] < args[1] :
    proc.op === "=" ? args[0] === args[1] :
    proc.op === "not" ? ! args[0] :
    proc.op === "eq?" ? eqPrim(args) :
    proc.op === "string=?" ? args[0] === args[1] :
    proc.op === "cons" ? consPrim(args[0], args[1]) :
    proc.op === "car" ? carPrim(args[0]) :
    proc.op === "cdr" ? cdrPrim(args[0]) :
    proc.op === "list?" ? isListPrim(args[0]) :
    proc.op === "number?" ? typeof(args[0]) === 'number' :
    proc.op === "boolean?" ? typeof(args[0]) === 'boolean' :
    proc.op === "symbol?" ? isSymbolSExp(args[0]) :
    proc.op === "string?" ? isString(args[0]) :
    Error("Bad primitive op " + proc.op);

const minusPrim = (args: Value[]): number | Error => {
    // TODO complete
    let x = args[0], y = args[1];
    if (isNumber(x) && isNumber(y)) {
        return x - y;
    } else {
        return Error(`Type error: - expects numbers ${args}`)
    }
}

const divPrim = (args: Value[]): number | Error => {
    // TODO complete
    let x = args[0], y = args[1];
    if (isNumber(x) && isNumber(y)) {
        return x / y;
    } else {
        return Error(`Type error: / expects numbers ${args}`)
    }
}

const eqPrim = (args: Value[]): boolean | Error => {
    let x = args[0], y = args[1];
    if (isSymbolSExp(x) && isSymbolSExp(y)) {
        return x.val === y.val;
    } else if (isEmptySExp(x) && isEmptySExp(y)) {
        return true;
    } else if (isNumber(x) && isNumber(y)) {
        return x === y;
    } else if (isString(x) && isString(y)) {
        return x === y;
    } else if (isBoolean(x) && isBoolean(y)) {
        return x === y;
    } else {
        return false;
    }
}

const carPrim = (v: Value): Value | Error =>
    isCompoundSExp(v) ? first(v.val) :
    Error(`Car: param is not compound ${v}`);

const cdrPrim = (v: Value): Value | Error =>
    isCompoundSExp(v) ?
        ((v.val.length > 1) ? makeCompoundSExp(rest(v.val)) : makeEmptySExp()) :
    Error(`Cdr: param is not compound ${v}`);

const consPrim = (v: Value, lv: Value): CompoundSExp | Error =>
    isEmptySExp(lv) ? makeCompoundSExp([v]) :
    isCompoundSExp(lv) ? makeCompoundSExp([v].concat(lv.val)) :
    Error(`Cons: 2nd param is not empty or compound ${lv}`);

const isListPrim = (v: Value): boolean =>
    isEmptySExp(v) || isCompoundSExp(v);

// Evaluate a sequence of expressions (in a program)
export const evalExps = (exps: Exp[], env: Env): Value | Error =>
    isEmpty(exps) ? Error("Empty program") :
    isDefineExp(first(exps)) ? evalDefineExps(exps, env) :
    isEmpty(rest(exps)) ? L3applicativeEval(first(exps), env) :
    isError(L3applicativeEval(first(exps), env)) ? Error("error") :
    evalExps(rest(exps), env);

// Eval a sequence of expressions when the first exp is a Define.
// Compute the rhs of the define, extend the env with the new binding
// then compute the rest of the exps in the new env.
const evalDefineExps = (exps: Exp[], env): Value | Error => {
    let def = first(exps);
    let rhs = L3applicativeEval(def.val, env);
    if (isError(rhs))
        return rhs;
    else {
        let newEnv = makeEnv(def.var.var, rhs, env);
        return evalExps(rest(exps), newEnv);
    }
}

// Main program
export const evalL3program = (program: Program): Value | Error =>
    evalExps(program.exps, makeEmptyEnv());

export const evalParse = (s: string): Value | Error => {
    let ast: Parsed | Error = parseL3(s);
    if (isProgram(ast)) {
        return evalL3program(ast);
    } else if (isExp(ast)) {
        return evalExps([ast], makeEmptyEnv());
    } else {
        return ast;
    }
}

