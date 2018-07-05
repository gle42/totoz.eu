// Entry Point for the totoz server

import express = require('express')
import path = require('path')
import morgan = require('morgan')
import session = require('express-session')
import bodyParser = require('body-parser')
import passport = require('passport')
import localStrategy = require('passport-local')
import flash = require('connect-flash')
import common_routes from './routes/common'
import auth_routes from './routes/auth'
import router from './routes/routes'
const drupalHash = require('drupal-hash')
import {User, get_user} from './model/user'

// Misc. functions

// Makes an absolute path from a path relative to the project folder
const absPath = (relPath: string) => path.join(__dirname, relPath)


// Environment variables
//   NOIMAGES : if true, serve a default image for the totozes. Useful for a
//              dev. environment without the full totoz set.
const port = +(process.env['PORT'] || 3000)
const hostname = process.env['HOSTNAME'] || '127.0.0.1'
const noimages = process.env['NOIMAGES'] ? true : false
const session_secret = process.env['SECRET'] || 'abcd'
console.warn('WARNING: the SECRET environment variable is not set')

// Setup and run app
const app = express()

app.set('view engine','pug')
app.set('views',absPath('../views'))


// Middleware
if(noimages)
    app.get(/\.gif$/,(req,res)=>res.sendFile(absPath('../static/uxam.gif')))

app.use(express.static(absPath('../static')))

if(app.get('env')=='development')
    app.use(morgan('tiny'))

app.use(session({
    secret: session_secret,
    saveUninitialized: false,
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new localStrategy.Strategy(async (username, password, done) => {
    const user = await get_user(username.toLowerCase())

    if (user && user.password && drupalHash.checkPassword(password,user.password))
        done(null, user)
    else
        done(null, false, {message:'abc'})
}))
passport.serializeUser(function(user: User, done) {
    done(null, user.name.toLowerCase());
});
passport.deserializeUser(async function(id:string, done) {
    const user = await get_user(id)
    done(null,user)
});

app.use(flash())

app.use('/', common_routes)
app.use('/', auth_routes(passport))
app.use('/', router)

app.listen(port,hostname)