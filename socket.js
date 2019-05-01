const serializeError = require('serialize-error');
let io = require('socket.io-client');

function Socket (sock, functions = {}, with_proxy=true) {
    functions = functions || {};
    if(functions instanceof Promise) {
        functions.then((x) => {
            calls = functions = x;

            x.$public = () => destructureMap(functions);
        });
        
        functions = {};
    }
    
    let Handler;
    initializeHandler();
    sock = typeof sock === "string"? io.connect(sock) : sock;

    if(sock instanceof Promise) {
        sock.then((url) => {
            sock = io.connect(url);
            initializeSocket();
        });
    } else initializeSocket();

    let calls = functions;
    let handlers = {
        success: {},
        failure: {}
    };

    let _iid = 0;
    let connection_id = Math.floor(Date.now() * Math.random());
    let id = () => `${connection_id}-${++_iid}`;

    let handler = Handler(call);

    functions.$public = () => destructureMap(functions);

    function getFunction (path) {
        let pointer = calls;
        for(let i=0, l=path.length;i<l;i++) pointer = pointer[path[i]];
        
        return pointer;
    }

    async function call (routes, ...args) {
        if(sock instanceof Promise) await sock;

        await Connect();
        
        let iid = id();
        let callbacks = {};

        for(let i=0, l=args.length;i<l;i++) {
            let arg = args[i];

            if(typeof arg === "function") {
                let cb_id = id();

                callbacks[i] = cb_id;
                calls[cb_id]= arg;
            }
        }

        sock.emit('call', {
            path: routes,
            iid: iid,
            args: args,
            cb: callbacks
        });
        
        return await new Promise((success, failure) => {
            setSuccessHandler(iid, success);
            setFailureHandler(iid, failure);
        });
    }

    function removeHandlers (iid) {
        delete handlers.success[iid];
        delete handlers.failure[iid];
    }

    function setSuccessHandler (iid, fn) {
        handlers.success[iid] = fn;
    }

    function setFailureHandler (iid, fn) {
        handlers.failure[iid] = fn;
    }

    function addToHandler (obj, base=handler, route=[]) {
        for(let i in obj) {
            if(typeof obj[i] === "object" && !Array.isArray(obj[i])) {
                if(!base[i]) base[i] = {};

                addToHandler(obj[i], base[i], [...route, i]);
            } else {
                base[i] = (...args) => call([...route, i], ...args);
            }
        }
    }

    function destructureMap (obj, path=[]) {
        const base = {};

        for(let i in obj) {
            let x = obj[i];
            
            if(typeof x === "object" && !Array.isArray(x)) base[i] = destructureMap(x, [...path, i]);
            else base[i] = {
                arguments: getParamNames(x),
                help: functions.$help && functions.$help(path, x)
            }
        }

        return base;
    }

    function initializeSocket () {
        sock.on('call', async ({ path, iid, args, cb }) => {
            try {
                await Connect();
                
                
                let fn = getFunction(path);
                
                for(let i in cb) args[i] = (..._args) => call([cb[i]], ..._args);
                if(typeof fn !== "function") throw 'UNKOWN_METHOD';
                
                functions.$before_call && functions.$before_call({ path, iid, args });

                let result = await fn.apply(handler, args);
    
                sock.emit('res', { iid, res: result });
                
                functions.$after_call && functions.$after_call({ path, args, iid, res: result });
            } catch (exc) {
                if(exc instanceof Error) exc = serializeError(exc);
                if(functions.$error) exc = functions.$error(exc);
                
                console.log(exc)
                sock.emit('exc', { iid, exc });

                functions.$after_error && functions.$after_error({ path, args, iid, res: result });
            }
        });

        sock.on('res', ({ iid, res }) => {
            handlers.success[iid] && handlers.success[iid](res);
    
            removeHandlers(iid);
        });
        
        sock.on('exc', ({ iid, exc }) => {
            handlers.failure[iid] && handlers.failure[iid](exc);
    
            removeHandlers(iid);
        });
        
        sock.on('disconnect', () => {
            for(let i in handlers.failure) handlers.failure[i]('DISCONNECTED');
        });
    }

    const Connect = () => new Promise((success, failure) => {
        if(sock.id) return success();

        sock.once('connect', success);
        sock.once('connect_error', failure);
        sock.once('error', (err) => failure(err));
    });

    function initializeHandler () {
        if(with_proxy) {
            Handler = function Handler (cb, base_route = []) {
                let proxy = new Proxy(function () {}, {
                    get (target, route, receiver) {
                        if(route === '$sock') return sock;
                        return Handler(cb, [...base_route, route]);
                    },
            
                    apply (target, thisArg, args) {
                        return cb && cb(base_route, ...args);
                    },

                    set (target, prop, value) {
                        let pointer = functions;
                        
                        for(let i=0, l=value.length - 1;i<l;i++)
                            pointer = pointer[prop];

                        pointer[value[value.length - 1]] = value;
                    }
                });
            
                return proxy;
            }
        } else {
            Handler = function Handler ($call) {
                return {
                    async $connect () {
                        let routes = await $call(['$public']);
                        
                        addToHandler(routes);
                    }
                };
            }
        }
    }

    return handler;
}

module.exports = Socket;
module.exports.NoProxy = (sock, fn) => Socket(sock, fn, false);

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if(result === null)
     result = [];
  return result;
}