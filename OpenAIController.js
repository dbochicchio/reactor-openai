/** A Reactor controller for OpenAI.
 *  Copyright (c) 2022/2025 Daniele Bochicchio, All Rights Reserved.
 *  OpenAIController is offered under MIT License - https://mit-license.org/
 *  More info: https://github.com/dbochicchio/reactor-openai
 *
 *  Disclaimer: This is beta software, so quirks and bugs are expected. Please report back.
 */

const version = 24338;
const className = "openai";
const ns = "x_openai"
const ignoredValue = "@@IGNORED@@"

const Controller = require("server/lib/Controller");
const Capabilities = require("server/lib/Capabilities");

const Logger = require("server/lib/Logger");
Logger.getLogger('OpenAIController', 'Controller').always("Module OpenAIController v%1", version);

// modules
const util = require("server/lib/util");

const delay = ms => new Promise(res => setTimeout(res, ms));

var impl = false;  /* Implementation data, one copy for all instances, will be loaded by start() later */

var models = null;  /* Configuration data, one copy for all instances, will be loaded by start() later */

module.exports = class OpenAIController extends Controller {
	constructor(struct, id, config) {
		super(struct, id, config);  /* required *this.*/

		this.failures = 0;

		this.stopping = false;      /* Flag indicates we're stopping */
	}

	/** Start the controller. */
	async start() {
		/** Load implementation data if not yet loaded. Remove this if you don't
		 *  use implementation data files.
		 */
		if (false === impl) {
			impl = await this.loadBaseImplementationData(className, __dirname);
		}

		this.log.debug(5, "%1 starting", this);

		this.stopping = false;
		this.run();

		return this;
	}

	/* Stop the controller. */
	async stop() {
		this.log.debug(5, "%1 stopping", this);
		this.stopping = true;

		/* Required ending */
		return await super.stop();
	}

	/* run() is called when Controller's single-simple timer expires. */
	run() {
		this.log.debug(5, "%1 running", this);

		this.purgeDevices();
		this.startClient();
	}

	/* startClient() load status and creates the entities */
	startClient() {
		if (this.stopping) return;

		// mark all as dead
		this.entities.forEach(e => e.markDead(true));

		// system
		this.mapDevice(this.system.id, this.config.name ?? "OpenAI Controller", ["sys_system"], "sys_system.state",
			{
				"sys_system.state": false
			});

		// map each model as a separate entity
		if (this.config.models) {
			// reduct models to a map
			models = this.config.models.reduce((x, item) => {
				x[item.id] = item;
				return x;
			}, {});

			// create entities for each model
			for (const model of this.config.models) {
				if (model.id !== undefined && model.model !== undefined && model.service !== undefined) {
					this.mapDevice(model.id, model.name, [ns], "_ns_.model",
						{
							"_ns_.model": model.model,
							"_ns_.service": model.service.toLowerCase(),
						});
				}
				else
					this.log.warn("%1 [startClient] invalid configuration for %2", this, model);
			}
		}
		else
			this.log.warn("%1 [startClient] no models specified", this);

		this.log.debug(5, "%1 [startClient] completed", this);
		this.online();

		// purge deleted entities
		this.purgeDeadEntities();
	}

	onHttpError(response) {
		this.log.debug(5, "%1 [onHttpError]: %2", this, response);
		return Promise.reject(`HTTP error - ${response.url} - ${response.status} - ${response.statusText}`);
	}

	async callService(e, params) {
		let service = e.getAttribute(`${ns}.service`);
		let config = models[e.id];
		this.log.debug(5, "%1 [callService]: %2 - %3", this, e.id, params);

		let body = {
			model: e.getAttribute(`${ns}model`) ?? 'gpt-4',
			messages: [{ role: "user", content: params.text }],
			max_tokens: params.max_tokens || config.max_tokens || 2000,
			temperature: params.temperature || config.temperature || 0.5,
			top_p: params.top_p || config.top_p || 1,
			frequency_penalty: params.frequency_penalty || config.frequency_penalty || 0,
			presence_penalty: params.presence_penalty || config.presence_penalty || 0,
			stop: params.stop || config.stop || null
		};

		let url = null;
		let headers = null;

		switch (service) {
			case 'openai':
				// support for openai service
				url = `https://api.openai.com/v1/chat/completions`;

				body.max_completion_tokens = body.max_tokens;
				body.max_tokens = undefined;

				headers = {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${config.api_key}`
				};
				break;
			case 'azure':
				// support for azure openai service
				url = `${config.endpoint}`;

				headers = {
					'Content-Type': 'application/json',
					'api-key': config.api_key
				};
				break;
			default:
				return Promise.reject(`Model is not supported: ${service}`);
		}

		this.log.debug(5, "%1 [callService] %2 - %3 - %4", this, e.id, url, body);

		const response = await fetch(url, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			return this.onHttpError(response);
		}

		const data = await response.json();
		this.log.debug(5, "%1 [callService] response from %2: %3", this, e.id, data);

		// return the response
		return Promise.resolve(data.choices[0].message.content);
	}

	/* performOnEntity() is used to implement actions on entities */
	async performOnEntity(e, actionName, params) {
		this.log.debug(5, "%1 [performOnEntity] %3 - %2 - %4", this, actionName, e, params);

		switch (actionName) {
			case `${ns}.prompt`:
				if (params?.text === undefined) {
					this.log.warn("%1 [performOnEntity] %2 - text param is mandatory and must be specified", this, params);
					return;
				}
				else if (params?.text?.length < 3) {
					this.log.warn("%1 [performOnEntity] %2 - text param is mandatory and must at least 3 chars", this, params);
					return;
				}
				else if (params?.text?.length > 6000) {
					this.log.warn("%1 [performOnEntity] %2 - text param is too big", this, params);
					return;
				}

				return await this.callService(e, params);

			case 'sys_system.restart':
				this.stopping = false;
				this.startClient();
				return;
		}

		return super.performOnEntity(e, actionName, params);
	}

	/* Maps a device into a MSR entity */
	mapDevice(id, name, capabilities, defaultAttribute, attributes) {
		this.log.debug(5, "%1 mapDevice(%2, %3, %4, %5, %6)", this, id, name, capabilities, defaultAttribute, attributes);

		let isNew = false;
		let e = this.findEntity(id);

		try {
			if (!e) {
				this.log.notice("%1 Creating new entity for %2 - %3", this, id, name);
				e = this.getEntity(className, id);
				e.setName(name);
				e.setType(className);
				isNew = true;
			}

			e.deferNotifies(true);
			e.markDead(false);

			// capabilities
			if (capabilities) {
				this.log.debug(5, "%1 [%2] adding capabilities: %3", this, id, capabilities);
				e.extendCapabilities(capabilities);

				// Check controller and system capabilities versions for changes
				const vinfo = { ...Capabilities.getSysInfo(), controller: version };
				const hash = util.hash(JSON.stringify(vinfo));
				if (e._hash !== hash) {
					e.refreshCapabilities();
					e._hash = hash;
				}
			}

			this.updateEntityAttributes(e, attributes);

			if (defaultAttribute)
				e.setPrimaryAttribute(defaultAttribute.replace(/_ns_/g, ns));

			if (isNew)
				this.sendNotice('Discovered new device {0:q} ({1}) on controller {2:q}', name, id, this);
		} catch (err) {
			this.log.err("%1 [mapDevice] error: %2", this, err);
		} finally {
			e.deferNotifies(false);
		}
	}

	updateEntityAttributes(e, attributes) {
		if (e && attributes) {
			e.deferNotifies(true);
			e.markDead(false);

			for (const attr in attributes) {
				var newValue = attributes[attr];

				// skip ignored values
				if (ignoredValue != newValue) {
					// check if value has changed
					var attrName = attr.replace(/_ns_/g, ns);
					var value = e.getAttribute(attrName);

					// check for and skip unchanged values
					var changed = value != newValue && JSON.stringify(value) != JSON.stringify(newValue);
					if (changed) {
						var id = e.getCanonicalID();
						this.log.debug(5, "%1 [%2] %3: %4 => %5", this, id, attrName, newValue, value);
						e.setAttribute(attrName, newValue);
					}
				}
			}

			e.deferNotifies(false);
		}
	}

	onError(err) {
		console.log(err);
		this.log.err("%1 Error: %2", this, err);

		try {
			this.startDelay(Math.min(120_000, (this.config.error_interval || 5_000) * Math.max(1, ++this.failures - 12)));
		}
		catch {
			// soft warning
		}

		if (this.failures >= 3) {
			this.offline();
		}
	}
};