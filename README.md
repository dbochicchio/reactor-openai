# reactor-openaicontroller
OpenAI Controller for Reactor - Multi-Hub Automation.

## Installation
OpenAI Controller must be installed separately. Just download all the files from this repo.

Create, if it does not already exist, a directory called *ext* in your Reactor install directory (so it should be at the same level as config, storage, etc.).

```
cd /path/to/reactor
mkdir ext
```

If you are running Reactor in a docker container, the *ext* directory should be created in the data directory, where your config and storage directories live as indicated above.

Change directory into the new *ext* directory:

```
cd ext
mkdir OpenAIController
```

Copy all the files in the new directory named *OpenAIController*.
Your final path should be */path/to/reactor/ext/OpenAIController*.

Run the install script. If you are using a "bare metal" install (not a docker container):

```
cd OpenAIController
./install.sh
```

If you are running Reactor in a docker container, we will open a container shell in which to do the install (the Reactor container must be up and running):

```
docker exec -it <container-name> /bin/sh
cd /var/reactor/ext/OpenAIController
./install.sh
exit
```

From here, proceed to Basic Configuration below.

## Basic Configuration

In order to use OpenAIController, you have to add an entry for it to the controllers section of your *reactor.yaml* file.

```
controllers:
  # Your existing controllers will be below the above line.
  # Add the following after the last "- id" line in this
  # section.
  - id: openai
    name: Open AI
    implementation: OpenAIController
    enabled: true
    config:
      models:
        - id: openai
          name: OpenAI GPT-4
          model: gpt-4
          service: openai
          api_key: xxxxx # taken from your Open AI dashboard
          max_tokens: 2000 # default
          temperature: 0.5 # default
          top_p: 1 # default
          frequency_penalty: 0 # default
          presence_penalty: 0 # default
          stop: null # default
        - id: azure
          name: Azure GPT-4
          model: gpt-4
          service: azure
          endpoint: "https://XXX.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2023-03-15-preview" # taken from your Azure GPT-4 service
          api_key: xxxx # taken from Azure
          max_tokens: 2000 # default
          temperature: "0.5" # default
          top_p: 1 # default
          frequency_penalty: 0 # default
          presence_penalty: 0 # default
          stop: null # default
```

You could map multiple models (ie: GPT-4, GTP4-o) from multiple providers (Azure, OpenAI). Just repeat the configuration and change id accordingly.
Each model will create an entity that will drive the request. The response will be captured via the *prompt* action to a local variable in your flow.

Restart Reactor to make the changes take effect. After that, you should be able to refresh the UI, go the Entities list, clear any existing filters, and choose "OpenAI" from the controllers filter selector. That should then show you one entity represening the models. If you don't see this, check the log for errors.
 
## Support

This is beta software, so expect quirks and bugs. Support is provided via https://smarthome.community/.