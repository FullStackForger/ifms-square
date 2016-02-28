'use strict';
const
	Hapi = require('hapi'),
	Boom = require('boom'),
	Hoek = require('hoek'),
	Glue = require('glue'),
	config = require('./config'),
	server = new Hapi.Server()

let uuid = 1       // todo: unique identifiers
function handleTwitterLogin(request, reply) {
	//Just store the third party credentials in the session as an example. You could do something
	//more useful here - like loading or setting up an account (social signup).
	const sid = String(++uuid)
	request.server.app.cache.set(sid, request.auth.credentials.profile, 0, (err) => {
		if (err) return reply(err)
		request.cookieAuth.set({sid: sid})
		//return reply('<pre>' + JSON.stringify(request.auth.credentials, null, 4) + '</pre>')
		return reply.redirect('/')
	})
}

// server manifest for glue
const manifest = {
	connections: [{
		port: config.port || process.env.PORT || 3000,
		host: config.host || process.env.HOST || 'localhost'
	}],
	registrations: [
	{ plugin: 'bell', options: {}},
	{ plugin: 'hapi-auth-cookie', options: {}},
	{ plugin: 'hapi-user-router', options: { routes: { prefix: '/user' }}}
	]
}

const options = {
	relativeTo: __dirname,
	preRegister: function (server, callback) {
		config.auth.twitter.handler = handleTwitterLogin
		server.app.config = config
		callback()
	}
}

Glue.compose(manifest, options, (err, server) => {
	Hoek.assert(!err, err)

	// set cache policy
	const cache = server.cache({
		segment: config.auth.session.segment,
		expiresIn: config.auth.session.expiresIn
	})

	// expose cache in a runtime app state
	server.app.cache = cache

	// Setup the session strategy
	server.auth.strategy('session', 'cookie', true, {
		cookie: config.auth.session.cookie,
		password: config.auth.session.password,
		redirectTo: '/user/login/twitter', // redirect url if there is no session
		isSecure: config.auth.session.isSecure,
		validateFunc: function (request, session, callback) {
			cache.get(session.sid, (err, cached) => {
				if (err)  return callback(err, false)
				if (!cached) return callback(null, false)
				return callback(null, true, cached.account)
			})
		}
	})

	server.route({
		method: 'GET',
		path: '/',
		config: {
			auth: 'session', //<-- require authentication session for this
			handler: function (request, reply) {
				let sessionId = request.auth.credentials.sid
				cache.get(sessionId, (err, value, cached, log) => {
					if (err) reply(Boom(err))
					let profile = value
					//Return a message using the information from the session
					return reply('<pre>' + JSON.stringify(profile, null, 4) + '</pre>')
				})
			}
		}
	})

	// Start the server
	server.start((err) => {
		if (err) throw err
		console.log('Server running at:', server.info.uri)
	})
})


