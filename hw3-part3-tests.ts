import * as assert from "assert";
import { evalParse} from './L3-eval';

assert.deepEqual(evalParse(`
(L3 (define loop (lambda (x) (loop x)))
    ((lambda ((f lazy)) 1) (loop 0)))`),
    1);

