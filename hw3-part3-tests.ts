import * as assert from "assert";
import { evalParse} from './L3-eval';
import { parseL3 } from "./L3-ast";

assert.deepEqual(evalParse(`
(L3 (define loop (lambda (x) (loop x)))
    ((lambda ((f lazy)) 1) (loop 0)))`),1);

assert.deepEqual(evalParse(`
    (L3 (define f 
        (lambda (a (b lazy))
          a))
       
      (f 1 (/ 1 0)))`),1);

assert.deepEqual(evalParse(`
      (L3
        
(define loop
    (lambda (x)
      (loop x)))
  
  
  
  
  
    ((lambda (x)
      ((lambda ((y lazy))
        (if (= x 0)
            1
            y))
      (loop 0))
    )0))`),1);
    