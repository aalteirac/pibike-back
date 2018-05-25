
const Koa = require('koa');
const router = require('koa-router')();
const mount = require('koa-mount');
var cors = require('koa-cors');
// create an instance of the Koa object
const app = new Koa();
// mount the route
app.use(cors());
app.use(mount(require('./router/feed.js')));
app.use(router.routes()); // route middleware
if(require.main === module) {
    app.listen(3000); // default
}