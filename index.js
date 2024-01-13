//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { doExtrasFetch, extension_settings, getApiUrl, getContext, modules } from "../../../extensions.js";
import { eventSource, event_types, getRequestHeaders, saveSettingsDebounced, substituteParams, chat_metadata } from "../../../../script.js";
import { world_names, importWorldInfo } from "../../../world-info.js";
import { executeSlashCommands, registerSlashCommand } from '../../../slash-commands.js';
import { ElevenLabsTtsProvider } from '../../tts/elevenlabs.js'
import { SileroTtsProvider } from '../../tts/silerotts.js'
import { CoquiTtsProvider } from '../../tts/coqui.js'
import { SystemTtsProvider } from '../../tts/system.js'
import { NovelTtsProvider } from '../../tts/novel.js'
import { translate } from '../../translate/index.js'

// Keep track of where your extension is located, name should match repo name
const extensionName = "p0rn-director";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const actionMap = new Map();

const postHeaders = {
	'Content-Type': 'application/json',
	'Bypass-Tunnel-Reminder': 'bypass',
};

const defaultSettings = {

	enabled: false,
	script: 'P0rn Director',
	max_duration: 60,
	opening: 'Opening',
	closing: 'Closing',
	first_words: 'Scenario: {{char}} is giving {{user}} step by step instructions as follows:'
};

registerSlashCommand("stopandthank", stopandthankFunction, ["Jerk off instruction"], "Your character is giving you detailed instructions /help", true, true);

registerSlashCommand("countandthank", countFunction, ["Jerk off instruction"], "Your character is giving you detailed instructions /help", true, true);



var list = [];

var notes = [];

var receivedForNote = 0;

var startTime = 0;

eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
eventSource.on(event_types.USER_MESSAGE_RENDERED, handleOutgoingMessage);

var countTo;
var currentCount;

var wait = false;

var cleanupIndex = -1;
var checkForCleanup = false;

function stopandthankFunction(args, time) {

	talk("I will let you know when you can stop");
	wait = true;
	sleep(time * 1000).then(() => { if (wait) talk("You can stop now and thank me.") });
}

function countFunction(args, count) {
	countTo = count;
	currentCount = 0;
	counting();
}

async function counting(args, count) {

	if (countTo < 0)
		return;

	if (currentCount === 0) {
		talk("Let me count for you.");
		sleep(random(2000, 5000)).then(() => { counting() });
	}
	else if (currentCount <= countTo) {
		var text = translateNumer(currentCount) + ".";
		talk(text);
		sleep(random(2000, 5000)).then(() => { counting() });
	}
	else
		talk("You can stop now and thank me.")
	currentCount++;
}

const single_digit = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const double_digit = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const below_hundred = ['Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function translateNumer(n) {
	var word = ""
	if (n < 10) {
		word = single_digit[n] + ' '
	}
	else if (n < 20) {
		word = double_digit[n - 10] + ' '
	}
	else if (n < 100) {
		var rem = translateNumer(n % 10)
		word = below_hundred[(n - n % 10) / 10 - 2] + ' ' + rem
	}
	else if (n < 1000) {
		word = single_digit[Math.trunc(n / 100)] + ' Hundred ' + translateNumer(n % 100)
	}
	else if (n < 1000000) {
		word = translateNumer(parseInt(n / 1000)).trim() + ' Thousand ' + translateNumer(n % 1000)
	}
	else if (n < 1000000000) {
		word = translateNumer(parseInt(n / 1000000)).trim() + ' Million ' + translateNumer(n % 1000000)
	}
	else {
		word = translateNumer(parseInt(n / 1000000000)).trim() + ' Billion ' + translateNumer(n % 1000000000)
	}
	return word.toLowerCase();
}

async function handleOutgoingMessage(data) {

	const context = getContext();
	const chat = context.chat;

	if (checkForCleanup == true) {

		if (cleanupIndex > 0) {
			console.log(">>>before splice " + chat.length)
			const cleanUp = cleanupIndex;
			cleanupIndex = chat.length-cleanupIndex;
			//chat.splice(0, cleanupIndex);
			executeSlashCommands("/cut 1-"+cleanUp);
			console.log(">>>before splice " + chat.length)
		}
		else
			cleanupIndex = chat.length-2;
		
		checkForCleanup=false;
	}

}

async function handleIncomingMessage(data) {

	countTo = -1;
	wait = false;
	receivedForNote++;

	const context = getContext();
	const chat = context.chat;
	const message = structuredClone(chat[chat.length - 1]).mes;


	if (extension_settings[extensionName].enabled === true) {


		if (chat.length === 1)
			init();
		else {
			const result = await queryMessages(message);

			result.forEach((item) => {

				const resultText = item.content;


				var count = parseInt(resultText.substring(0, resultText.indexOf('.')));

								console.log(">>>found " + resultText)
								console.log(">>>receivedForNote " + receivedForNote)
								console.log(">>>count " + count)
								console.log(">>>notes.length " + notes.length)

				var action = actionMap.get(resultText);
				
				console.log(">>>action " + action)

				if (receivedForNote > (count / 2) && !(action === undefined)) {

					console.log("start action " + action)

					waitForMessage(action);
				}

				if (notes.length > 1) {

					const notesTexts = notes[0].split('\n');

										console.log(">>>notesTexts.length " + notesTexts.length)

					if (receivedForNote > (notesTexts.length / 2) && resultText.localeCompare(notesTexts[notesTexts.length - 1]) === 0) {

						notes.shift();
						receivedForNote = 0;
						checkForCleanup = true;

						var now = new Date();
						var duration = (now.valueOf() - startTime) / 60000;
						if (duration > extension_settings[extensionName].max_duration)
							while (notes.length > 1)
								notes.shift();

						addMessages(notes[0]);
						$('#extension_floating_prompt').val(notes[0]).trigger('input');
					}

				}

			});

		}
	}

}

function random(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

function formatNote(rawText) {
	rawText = rawText.replace(/^(?=\n)$|^\s*|\s*$|\n\n+/gm, "")
	var text = substituteParams('[' + extension_settings[extensionName].first_words + '\n' + rawText + ']');
	text = text.replace(/(?:\r\n|\r|\n)/g, '\n<br>');
	var count = 1;
	while (text.includes('<br>')) {
		text = text.replace("<br>", count + ". ");
		count++;
	}

	var message = ''

	text.split('\n').forEach((m) => {

		var i = m.indexOf('{{choose:');
		if (i > -1) {
			var j = m.indexOf('}}');

			var choose = m.substring(i + 9, j).trim().split(';');

			var n = m.substring(0, i) + choose[random(0, choose.length)] + m.substring(j + 2);

			m = n;
		}

		var i = m.indexOf('{{count:');
		if (i > -1) {
			var j = m.indexOf('}}');
			var n = m.substring(0, i) + m.substring(j + 2);
			var nTranslate = m.substring(i + 8, j).trim();
			var n = m.substring(0, i) + translateNumer(nTranslate) + m.substring(j + 2);
			actionMap.set(n, "/countandthank " + nTranslate);
			m = n;
		}


		i = m.indexOf('{{action:');
		if (i > -1) {
			var j = m.indexOf('}}');
			var n = m.substring(0, i) + m.substring(j + 2);
			var action = m.substring(i + 9, j).trim();
			actionMap.set(n, action);
			m = n;
		}

		message = message + m;
		if (!m.endsWith(']'))
			message = message + "\n";
	});

	return message;
}

async function init() {

	const now = new Date();
	startTime = now.valueOf();

	const response = await fetch('/api/worldinfo/get', {
		method: 'POST',
		headers: getRequestHeaders(),
		body: JSON.stringify({ name: extension_settings[extensionName].script }),
		cache: 'no-cache',
	});

	list = [];

	notes = [];

	receivedForNote = 0;

	actionMap.clear();

	var open;
	var close;

	$('#porn_editor_closing').find('option[value!=""]').remove();
	$('#porn_editor_opening').find('option[value!=""]').remove();

	if (response.ok) {
		const data = await response.json();

		const entries = Object.values(data.entries);

		for (var j = 0; j < entries.length; j++) {
			const entry = entries[j];

			if (entry.disable === false) {
				list.push(entry);

				if (extension_settings[extensionName].closing === entry.comment)
					close = formatNote(entry.content);
				else if (extension_settings[extensionName].opening === entry.comment)
					open = formatNote(entry.content);
				else {
					if (entry.probability < 100) {
						for (var k = 0; k < entry.probability; k++) {
							notes.push(entry.content);
						}
					}
					else
						notes.push(entry.content);
				}
			}

		}

	}

	for (var k = 0; k < 1000; k++) {
		var a = random(0, notes.length);
		var b = random(0, notes.length);
		var swapa = notes[a];
		var swapb = notes[b];
		notes[a] = swapb;
		notes[b] = swapa;
	}

	var k = 0;
	if (notes.length > 1)
		do {
			if (notes[k].localeCompare(notes[k + 1]) == 0)
				notes.splice(k, 1);
			else
				k++;
		}
		while (k < notes.length - 1)

	notes.forEach((item, i) => {
		notes[i] = formatNote(item);

	});

	if (open)
		notes.unshift(open);
	if (close)
		notes.push(close);

	list.forEach((item, i) => {
		$('#porn_editor_closing').append(`<option value='${i}'${extension_settings[extensionName].closing === item.comment ? ' selected' : ''}>${item.comment}</option>`);

	});

	list.forEach((item, i) => {
		$('#porn_editor_opening').append(`<option value='${i}'${extension_settings[extensionName].opening === item.comment ? ' selected' : ''}>${item.comment}</option>`);
	});

	addMessages(notes[0]);
	$('#extension_floating_prompt').val(notes[0]).trigger('input');

	$(`input[name="extension_floating_position"][value="0"]`).prop('checked', true).trigger('input');
	chat_metadata['note_position'] = 0;
}

async function addMessages(note) {
	if (extension_settings.chromadb.freeze) {
		return { count: 0 };
	}

	const url = new URL(getApiUrl());
	try {
		url.pathname = '/api/chromadb/purge';

		const purgeResult = await doExtrasFetch(url, {
			method: 'POST',
			headers: postHeaders,
			body: JSON.stringify({ "chat_id": "p0rn director" }),
		});



	} catch (error) {

	}



	url.pathname = '/api/chromadb';

	let splitMessages = [];

	let id = 0;
	note.split('\n').forEach((m) => {

		if (id === 0)
			m = "This is a dummy.";

		if (m.trim().length > 0)
			splitMessages.push({
				content: m,
				date: id,
				role: 'assistant',
				id: `msg-${id++}`,
				meta: JSON.stringify(m),
			});
	});

	// no messages to add
	if (splitMessages.length === 0) {
		return { count: 0 };
	}

	try {
		const addMessagesResult = await doExtrasFetch(url, {
			method: 'POST',
			headers: postHeaders,
			body: JSON.stringify({ "chat_id": "p0rn director", messages: splitMessages }),
		});

		if (addMessagesResult.ok) {
			const addMessagesData = await addMessagesResult.json();
			return addMessagesData; // { count: 1 }
		}
	}
	catch (error) { };

	return { count: 0 };
}

async function queryMessages(query) {
	const url = new URL(getApiUrl());
	url.pathname = '/api/chromadb/query';

	const queryMessagesResult = await doExtrasFetch(url, {
		method: 'POST',
		headers: postHeaders,
		body: JSON.stringify({ "chat_id": "p0rn director", query, n_results: 1 }),
	});

	if (queryMessagesResult.ok) {
		const queryMessagesData = await queryMessagesResult.json();

		return queryMessagesData;
	}

	return [];
}



async function setPornScript(name) {
	if (!name) {
		return;
	}

	extension_settings[extensionName].script = name;
	saveSettingsDebounced();
}


let ttsProviders = {
	ElevenLabs: ElevenLabsTtsProvider,
	Silero: SileroTtsProvider,
	System: SystemTtsProvider,
	Coqui: CoquiTtsProvider,
	Novel: NovelTtsProvider,
}

const provider = new ttsProviders[extension_settings.tts.currentProvider]

let storedvalue = false;
let audioElement = new Audio()
audioElement.autoplay = true


async function talk(text) {

	if (extension_settings.translate.auto_mode === 'both' || extension_settings.translate.auto_mode === 'responses')
		text = await translate(text, extension_settings.translate.target_language);

	const response = await provider.generateTts(text, provider.settings.voiceMap[getContext().name2]);

	const audioData = await response.blob();
	const reader = new FileReader()
	reader.onload = function(e) {
		const srcUrl = e.target.result
		audioElement.src = srcUrl.toString();
	}
	reader.readAsDataURL(audioData)
	audioElement.addEventListener('ended', ended)
	audioElement.addEventListener('canplay', () => {
		talkingAnimation(true);
		console.debug(`Starting TTS playback`)
		audioElement.play()
	})

}



async function waitForMessage(action) {

	sleep(2000).then(() => {
		const temp = $('#tts_media_control')[0].className;
		if (temp.indexOf('play') === -1)
			waitForMessage(action);
		else
			executeSlashCommands(action);
	});

}

function ended() {
	talkingAnimation(false)
}

function talkingAnimation(switchValue) {
	if (!modules.includes('talkinghead')) {
		console.debug("Talking Animation module not loaded");
		return;
	}

	const apiUrl = getApiUrl();
	const animationType = switchValue ? "start" : "stop";

	if (switchValue !== storedvalue) {
		try {
			console.log(animationType + " Talking Animation");
			doExtrasFetch(`${apiUrl}/api/talkinghead/${animationType}_talking`);
			storedvalue = switchValue; // Update the storedvalue to the current switchValue
		} catch (error) {
			// Handle the error here or simply ignore it to prevent logging
		}
	}
}


// Loads the extension settings if they exist, otherwise initializes them to the defaults.
async function loadSettings() {
	//Create the settings if they don't exist
	extension_settings['p0rn-director'] = extension_settings['p0rn-director'] || {};
	if (Object.keys(extension_settings['p0rn-director']).length === 0) {
		Object.assign(extension_settings['p0rn-director'], defaultSettings);
	}

	$("#enabled_setting").prop("checked", extension_settings[extensionName].enabled).trigger("input");
	$('#porn_duration').val(extension_settings[extensionName].max_duration).trigger('input');



	world_names.forEach((item, i) => {
		$('#porn_editor_select').append(`<option value='${i}'${extension_settings[extensionName].script.includes(item) ? ' selected' : ''}>${item}</option>`);
		setPornScript(extension_settings[extensionName].script)
	});

	$('#porn_editor_first_words').val(extension_settings[extensionName].first_words).trigger('input');

	init();

}

function onFirstWords() {
	extension_settings[extensionName].first_words = $('#porn_editor_first_words').val().toString().trim();
	saveSettingsDebounced();
}

function onPornDurationInput() {
	extension_settings[extensionName].max_duration = Number($('#porn_duration').val());
	$('#porn_duration_value').text(extension_settings[extensionName].max_duration.toFixed(1));
	saveSettingsDebounced();
}


function onEnabled(event) {
	const value = Boolean($(event.target).prop("checked"));
	extension_settings[extensionName].enabled = value;
	saveSettingsDebounced();
}



// This function is called when the extension is loaded
jQuery(async () => {

	if (!world_names.includes('P0rn Director')) {

		let blob = await fetch(extensionFolderPath + "/lore/P0rn Director.json").then(r => r.blob());
		const file = new File([blob], "P0rn Director.json")
		importWorldInfo(file);
	}

	provider.loadSettings(extension_settings.tts[extension_settings.tts.currentProvider]);

	// This is an example of loading HTML from a file
	const settingsHtml = await $.get(`${extensionFolderPath}/director.html`);

	// Append settingsHtml to extensions_settings
	// extension_settings and extensions_settings2 are the left and right columns of the settings menu
	// Left should be extensions that deal with system functions and right should be visual/UI related
	$("#extensions_settings").append(settingsHtml);

	$("#enabled_setting").on("input", onEnabled);

	$('#porn_duration').on('input', onPornDurationInput);

	$('#porn_editor_select').on('change', async () => {
		var selectedIndex = String($('#porn_editor_select').find(':selected').val());


		if (selectedIndex === '') {
			selectedIndex = '0';
		}

		const worldName = world_names[selectedIndex];
		setPornScript(worldName);

		init();

	});

	$('#porn_editor_opening').on('change', async () => {

		var selectedIndex = String($('#porn_editor_opening').find(':selected').val());


		if (selectedIndex === '') {
			selectedIndex = '0';
		}

		extension_settings[extensionName].opening = list[selectedIndex].comment;
		saveSettingsDebounced();
	});

	$('#porn_editor_closing').on('change', async () => {

		var selectedIndex = String($('#porn_editor_closing').find(':selected').val());


		if (selectedIndex === '') {
			selectedIndex = '0';
		}

		extension_settings[extensionName].closing = list[selectedIndex].comment;
		saveSettingsDebounced();
	});

	$('#porn_editor_first_words').on('input', onFirstWords);


	// Load settings when starting things up (if you have any)
	loadSettings();
});

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
