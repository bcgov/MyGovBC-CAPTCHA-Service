var lame = require('lame');
var wav = require('wav');
var meSpeak = require("mespeak");
var streamifier = require("streamifier");

// Init audio
meSpeak.loadConfig(require("mespeak/src/mespeak_config.json"));
meSpeak.loadVoice(require("mespeak/voices/en/en-us.json"));

// create the Encoder instance
var encoder = new lame.Encoder({
    // input
    channels: 1,        // 1 channels
    bitDepth: 16,       // 16-bit samples
    sampleRate: 44100,  // 44,100 Hz sample rate

    // output
    bitRate: 128,
    outSampleRate: 22050,
    mode: lame.MONO // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
});

// start reading the WAV file from the input
var reader = new wav.Reader();

// we have to wait for the "format" event before we can start encoding
reader.on('format', onFormat);

// prep captcha string for good reading by putting spaces between letters
var captchaAudioText = "Type in the text box the following: " + "a 2 3 4 5 6";

// Generate audio, Base64 encoded WAV in DataUri format including mime type header
var audioArray = meSpeak.speak(captchaAudioText, {rawdata: "array"});

// convert to buffer
var audioBuffer = new Buffer(audioArray);

// Convert ArrayBuffer to Streamable
var audioStream = streamifier.createReadStream(audioBuffer);

// and start transferring the data
audioStream.pipe(reader);

function onFormat (format) {
    console.error('WAV format: %j', format);

    // encoding the wave file into an MP3 is as simple as calling pipe()
    var encoder = new lame.Encoder(format);

    var outputStream = reader.pipe(encoder);

    var dataUri = "data:audio/mp3;base64,";
    outputStream.on('data',function(arrayBuffer){
        dataUri += arrayBuffer.toString('base64');
    });

    outputStream.on('end',function(){
        console.log(dataUri);
    });
}
