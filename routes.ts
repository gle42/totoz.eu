// All the routes for the totoz.eu server

import express = require('express')
import hescape = require('escape-html')

import {incChar,highlightTerm, notEmpty, highlightTerms, highlightTermsSafe, lcase} from './utils'
import {totozes_startswith, totozes_info, totozes_ngram, TotozInfo, totoz_tags, totozes_byuser} from './model/totoz'
import { RequestHandler, RequestHandlerParams } from 'express-serve-static-core';

const throwtonext = (f: RequestHandler) => (req: express.Request,res: express.Response,next: express.NextFunction) => {
    Promise.resolve(f(req,res,next)).catch(next)
}

const routes = express.Router()

routes.use((req,res,next) => {
    const force_nsfw = req.query.force_nsfw === '1' // for debugging on localhost

    if (force_nsfw)
        res.locals.sfw = false
    else
        res.locals.sfw = ! (req.headers.host || '').match(/nsfw.*\.totoz\.eu$/)

    if ((req.headers.host || '').match(/totoz.eu$/)) {
        res.locals.sfw_url = 'https://beta.totoz.eu' +  req.url
        res.locals.nsfw_url = 'https://nsfw.beta.totoz.eu' + req.url
    } else {
        const chr = req.url.match(/\?/) ? '&' : '?' // Crude but good enough for debugging
        res.locals.sfw_url = req.url.replace(/.force_nsfw=1/,'')
        res.locals.nsfw_url = req.url + chr + 'force_nsfw=1'
    }
    
    next()
})

// query: the query string as typed by the user
// If the query has a length of 0: TODO
// If the query has keywords: return totozes that match all keywords exactly
async function search(query: string) {
    const keywords = query.split(' ')

    // TODO : show a better default page
    if (query.length == 0)
        keywords.push('a') // return 1 and 2 letter totozes

    // Do the index search
    const totozes = await totozes_ngram(keywords)

    // Filter the false positives
    let info:(TotozInfo & {tags?:string[]})[] = await totozes_info(totozes)

    for (let i of info)
        i.tags = await totoz_tags(i.name.toLowerCase()) // TODO use BULK op

    // if query length is zero don't refilter the default page
    if (query.length == 0)
        return info
    else
        return info.filter(i => keywords.every(
            k=>lcase(i.name).indexOf(lcase(k))>=0 ||
            i.tags!.some(t => lcase(t).indexOf(lcase(k))>=0)))

}

routes.get('/', throwtonext(async (req, res, next) => {
    // QUERY PARAMETER 1: query string (optional)
    const query:string = req.query.q || ''

    // QUERY PARAMETER 2: tlonly (optional)
    // if set to 1, only send the html fragment that contains the totoz list.
    // Otherwise send the full page.
    // This is used for refreshing the search results during find as you type
    const totozlist_only = req.query.tlonly === "1"
    const template = totozlist_only ? 'fragments/totoz_list' : 'index'

    // QUERY PARAMETER 2: showall (optional)
    const showall = req.query.showall === '1'
    
    let info = await search(query)

    const info2 = info
        .map(i=> ({ 
            ...i, // TODO : clean this shit
            lcName:i.name.toLowerCase(),
            detailsUrl: '/totoz/' + i.name.toLowerCase(),
            hiName:highlightTermsSafe(i.name,query.split(' '),'match'),
            hiTags:(i.tags != undefined && query != '') ?
                i.tags
                    .map(t=>highlightTermsSafe(t,query.split(' '),'match'))
                    .filter(t=>query.split(' ').some( kw => kw .length > 0 && t.indexOf(kw)>=0))
                : []
        }))
        .sort((a,b)=>a.lcName<b.lcName ? -1:1)
        .filter((e,i)=> i<120 || showall)
    
    const truncated_results = query.split(' ').some(kw => kw.length < 3) // TODO move near the search function
    const results_info = {
        shown: info2.length,
        count: info.length,
        count_txt: truncated_results ? 'more than ' + info.length : '' + info.length,
        showall_url: '/?q=' + hescape(query) + '&showall=1'
    }

    res.render(template, {totozes: info2, query, results_info, body_id:'index'})
}))

routes.get('/totoz/:totoz_id?', throwtonext(async (req, res, next) => {
    const totoz_id:string = req.params.totoz_id || ''
    const [totoz_info] = await totozes_info([totoz_id])

    if (!totoz_info || totoz_info.name === undefined)
        return next()
    
    const tags = await totoz_tags(totoz_id)
    
    res.render('totoz', {
        ...totoz_info,
        tags,
        body_id:'totoz',
        page_title: '[:' + totoz_id + ']',
    })
}))

routes.get('/user/:user_id?', throwtonext(async (req, res, next) => {
    const showall = req.query.showall === '1'
    const user_id:string = req.params.user_id || ''
    const user_totozes = await totozes_byuser(user_id)
    // TODO: bail if user not found

    const tinfo = await totozes_info(user_totozes)

    const tinfo2 = tinfo
        .map(t => ({
            ...t,
            hiTags: [],
            hiName: t.name,
            lcName:t.name.toLowerCase(),
            detailsUrl: '/totoz/' + t.name.toLowerCase(),
        }))
        .filter((t,i)=>i<120 || showall)
    const results_info = {
        shown: tinfo2.length,
        count: tinfo.length,
        count_txt: 0 ? 'more than ' + tinfo.length : '' + tinfo.length,
        showall_url: '/user/' + user_id + '?showall=1'
    }

    res.render('user', {user_id, results_info,totozes: tinfo2})
}))

export default routes