/// <reference path="libs/js/stream-deck.js" />
/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/utils.js" />

// Action Cache
const MACTIONS = {};

// Utils
const minmax = (v = 0, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const cycle = (idx, min, max) => (idx > max ? min : idx < min ? max : idx);
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// make sure to pass in a hex 7char-length color string (e.g. #336699)
const invertColor = (hexColor) => `#${(Number(`0x1${hexColor.slice(1)}`) ^ 0xFFFFFF).toString(16).slice(1).toUpperCase()}`;
const isLightColor = (hexColor, ramp = 127) => {
    const color = +("0x" + hexColor.slice(1).replace(hexColor.length < 5 && /./g, '$&$&'));
    const [r, g, b] = [color >> 16, color >> 8 & 255, color & 255];  // hex to rgb
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b)); // HSP see: http://alienryderflex.com/hsp.html
    return (hsp > ramp);
};
const isDarkColor = (hexColor, ramp) => !isLightColor(hexColor, ramp);
const complementaryColor = (color) => {
    const tag = (a, b) => (255 - parseInt(color.substring(a, b), 16)).toString(16).slice(-2);
    return `#${tag(1, 3)}${tag(3, 5)}${tag(5, 7)}`.toUpperCase();
};

// Action Events
const sampleClockAction = new Action('com.elgato.sample-clock.action');

sampleClockAction.onWillAppear(({context, payload}) => {
    console.log('will appear', context, payload);
    MACTIONS[context] = new SampleClockAction(context, payload);
});

sampleClockAction.onWillDisappear(({context}) => {
    // console.log('will disappear', context);
    MACTIONS[context].interval && clearInterval(MACTIONS[context].interval);
    delete MACTIONS[context];
});

sampleClockAction.onDidReceiveSettings(({context, payload}) => {
    // console.log('onDidReceiveSettings', payload?.settings?.hour12, context, payload);
    MACTIONS[context].didReceiveSettings(payload?.settings);
});

sampleClockAction.onTitleParametersDidChange(({context, payload}) => {
    // console.log('onTitleParametersDidChange', context, payload);
    MACTIONS[context].titleParametersDidChange(payload);
});

sampleClockAction.onDialPress(({context, payload}) => {
    // console.log('dial was pressed', context, payload);
    if(payload.pressed === false) {
        MACTIONS[context].toggleLongDateAndTime();
    }
});

sampleClockAction.onDialRotate(({context, payload}) => {
    // console.log('dial was rotated', context, payload);
    MACTIONS[context].dialRotate(payload.ticks);
});

sampleClockAction.onKeyUp(({context, payload}) => {
    // console.log('dial was rotated', context, payload);
    MACTIONS[context].dialRotate(1);
});

sampleClockAction.onTouchTap(({context, payload}) => {
    // console.log('touchpanel was tapped', context, payload);
    if(payload.hold === false) {
        MACTIONS[context].toggleLongDateAndTime();
    }
});

class SampleClockAction {
    #cache;

    constructor (context, payload) {
        this.#cache = {
            svg: '',
            time: 0
        };
        this.context = context;
        this.payload = payload;
        this.interval = null;
        this.isEncoder = payload?.controller === 'Encoder';
        this.ticks = '';
        this.settings = payload?.settings || {};
        if(!this.settings.mode) this.settings.mode = 0;
        if(!this.settings.hour12) this.settings.hour12 = false;
        if(!this.settings.locations) this.settings.locations = [];
        if(!this.settings.longDateAndTime) this.settings.longDateAndTime = false;
        if(!this.settings.color) this.settings.color = '#EFEFEF';
        this.invertedColor = isLightColor(this.color, 120) ? '#0078FF' : invertColor(this.color);
        this.fontFamily = "Arial, Helvetica, sans-serif";

        // default time and date options
        this.timeOptions = {
            short: {hour: '2-digit', minute: '2-digit'},
            long: {hour: '2-digit', minute: '2-digit', second: '2-digit'}
        };
        this.dateOptions = {
            short: {weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'},
            long: {weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric'}
        };
        this.size = 48; // default size of the icon is 48

        // $SD.setFeedbackLayout(this.context, './action/customlayout.json');
        this.init();
        this.update();
    }

    init() {
        this.interval = setInterval(() => {
            this.update();
        }, 1000);
    }

    get color() {
        return this.settings.color;
    }

    set color(value) {
        this.settings.color = value;
        this.invertedColor = isLightColor(value, 120) ? '#0078FF' : invertColor(value);
        this.ticks = ''; // trigger re-rendering of ticks
        this.saveSettings();
        this.update();
    }

    get locations() {
        return this.settings.locations;
    }

    set locations(value) {
        this.settings.locations = value;
        this.saveSettings();
    }

    get mode() {
        return this.settings.mode;
    }

    set mode(value) {
        this.settings.mode = minmax(value, 0, this.locations.length - 1);
        this.saveSettings();
    }

    get longDateAndTime() {
        return this.settings.longDateAndTime === true;
    }

    set longDateAndTime(value) {
        this.settings.longDateAndTime = value === true;
        this.saveSettings();
    }

    get hour12() {
        return this.settings.hour12;
    }

    set hour12(value) {
        this.settings.hour12 = value === true;
        this.saveSettings();
    }

    dialRotate(ticks = 1) {
        this.mode = cycle(this.mode + ticks, 0, this.locations.length - 1);
        this.update();
    }

    didReceiveSettings(settings) {
        let dirty = false;
        if(!settings) return;
        if(settings?.hasOwnProperty('locations')) {
            this.locations = Array.isArray(settings?.locations) ? settings?.locations : [];
            dirty = true;
        }
        if(settings?.hasOwnProperty('hour12')) {
            this.hour12 = settings?.hour12 === true;
            dirty = true;
        }
        if(settings?.hasOwnProperty('longDateAndTime')) {
            this.longDateAndTime = settings?.longDateAndTime === true;
            dirty = true;
        }
        if(dirty) this.update();
    }
    titleParametersDidChange(payload) {
        this.color = payload.titleParameters.titleColor;
    }

    saveSettings() {
        $SD.setSettings(this.context, this.settings);
    };

    toggleLongDateAndTime() {
        this.longDateAndTime = !this.longDateAndTime;
        this.update();
    }

    onlyRedrawWhenTimeChanges(o) {
        // only redraw if the calculated time-string has changed
        if(o.time !== this.#cache.time) {
            this.#cache.time = o.time;
            return true;
        }
    }

    onlyRedrawWhenSVGChanges(svg) {
        // only redraw if the svg has changed (eg. when the time changes, or hands are rotated by a fraction of a degree)
        if(svg !== this.#cache.svg) {
            this.#cache.svg = svg;
            return true;
        }
    }

    update() {
        const o = this.updateClockSettings();
        const svg = this.makeSvg(o);
        if(this.onlyRedrawWhenSVGChanges(svg) || this.onlyRedrawWhenTimeChanges(o)) {
            const icon = `data:image/svg+xml;base64,${btoa(svg)}`;
            if(this.isEncoder) {
                const payload = {
                    'title': o.date,
                    'value': o.time,
                    'value2': o.city,
                    icon
                };
                $SD.setFeedback(this.context, payload);
            }
            $SD.setTitle(this.context, o.city);
            $SD.setImage(this.context, icon);
        }
    }

    updateClockSettings() {
        // this is a quick way to get the current time in the selected timezone
        // but it's not the best way to do it
        // the returend timezone values is not correct, but since we're interested
        // only in the current date/time, it's ok
        const dateForTimeZone = (date, timeZone, locale = 'en-US') => new Date(date.toLocaleString('en-US', {timeZone}));
        // DateTime format options (including timezones)
        // const options = {
        //     year: '2-digit', month: '2-digit', day: '2-digit',
        //     hour: '2-digit', minute: '2-digit', second: '2-digit',
        //     timeZone: this.timeZone,
        // };
        // const formatter = new Intl.DateTimeFormat([], options);
        // const dateInNewTimezone = formatter.format(date);
        // const date = new Date().toLocaleString("en-US", {timeZone: "America/New_York"})
        // tz.forEach(timeZone => {
        //     console.log(timeZone.split("/").pop(), date.toLocaleTimeString([], {timeZone}));
        // });
        const hasDaylightSaving = this.locations[this.mode]?.indexOf('DST') > -1;
        const isDaylightSaving = (d) => {
            const firstDayOfYear = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
            const dayOutSideDST = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
            return Math.max(firstDayOfYear, dayOutSideDST) !== d.getTimezoneOffset();
        };

        const logTimeZones = (timezones = {}) => {
            // let date = new Date(Date.UTC(2012, 11, 20, 3, 0, 0));
            let date = new Date();

            console.log(`Base-Date: ${date}`);
            const table = [];

            Object.values(timezones).forEach(timeZone => {
                const date2 = dateForTimeZone(date, timeZone);
                const myTime = date.toLocaleTimeString([], {timeZone});
                const intlDateObj = new Intl.DateTimeFormat('en-US', {
                    timeZone: "America/New_York"
                });
                const newTime = date.toLocaleString("en-US", {timeZone});
                const newDate = intlDateObj.format(date);
                // console.log(timeZone, myTime, newTime, newDate);
                table.push([timeZone, myTime, newTime, newDate, date2.toLocaleString()]);

            });
            console.table(table);
        };

        const timeZone = this.locations[this.mode] || '';
        const date = timeZone.length ? new Date(new Date().toLocaleString('en-US', {timeZone})) : new Date();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        // if(seconds % 30 == 0) {
        //     logTimeZones(this.locations);
        //     console.info('timeZoneOptions', Intl.DateTimeFormat().resolvedOptions());
        // }
        const opts = this.longDateAndTime ? this.timeOptions.long : this.timeOptions.short;
        opts.hour12 = this.hour12 === true;
        const dateOpts = this.longDateAndTime ? this.dateOptions.long : this.dateOptions.short;
        const cityName = timeZone.length ? timeZone.split("/").pop().replace("_", " ") : '';
        const result = {
            minDeg: Math.round((minutes + seconds / 60) * 6), // rounding helps to reduce the number of redraws 
            secDeg: seconds * 6,
            hourDeg: ((hours % 12) + minutes / 60) * 360 / 12,
            time: date.toLocaleTimeString([], opts),
            date: date.toLocaleDateString([], dateOpts),
            weekday: date.toLocaleDateString([], {weekday: 'long'}),
            city: isDaylightSaving(date) ? `${cityName} (DST)` : cityName,
            ampm: hours >= 12 ? 'PM' : 'AM'
        };
        return result;
    }

    makeSvg(o) {
        const w = this.size;
        const r = w / 2;
        const lineStart = w / 20;
        const lineLength = w / 8;
        const sizes = {
            hours: round(w / 4.5),
            minutes: round(w / 9),
            seconds: round(w / 36)
        };
        const strokes = {
            hours: round(w / 30),
            minutes: round(w / 36),
            seconds: round(w / 48),
            center: round(w / 24)
        };
        const ampm = o.ampm;
        // create ticks only once
        if(!this.ticks.length) {
            const line = `x1="${r}" y1="${lineStart}" x2="${r}" y2="${lineStart + lineLength}"`;
            const ticks = () => {
                let str = `<g id="ticks" stroke-width="${sizes.seconds}" stroke="${this.color}">`;
                for(let i = 0;i < 12;i++) {
                    str += `<line ${line} transform="rotate(${i * 30}, ${r}, ${r})"></line>`;
                }
                str += '</g>';
                return str;
            };
            this.ticks = ticks();
        }
        this.ampm = this.isEncoder ? '' : `<text font-family="${this.fontFamily}" text-anchor="middle" x="${r}" y="${r - 5}" font-size="8" font-weight="800" fill="${this.invertedColor}">${ampm}</text>`;
        // if you prefer not to use a function to create ticks, see below at makeSvgAlt
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">
        ${this.ticks}
        ${this.ampm}
        <g stroke="${this.color}">
            <line id="hours" x1="${r}" y1="${sizes.hours}" x2="${r}" y2="${r}" stroke-width="${strokes.hours}" transform="rotate(${o.hourDeg}, ${r}, ${r})"></line>
            <line id="minutes" x1="${r}" y1="${sizes.minutes}" x2="${r}" y2="${r}" stroke-width="${strokes.minutes}" transform="rotate(${o.minDeg}, ${r}, ${r})"></line>
            ${this.longDateAndTime && `<line id="seconds" x1="${r}" y1="${sizes.seconds}" x2="${r}" y2="${r}" stroke-width="${strokes.seconds}" transform="rotate(${o.secDeg}, ${r}, ${r})"></line>`}
        </g>
        <circle cx="${r}" cy="${r}" r="${strokes.center}" fill="${this.color}" />        
    </svg>`;
    };

};



// Alternative

const makeSvgAlt = (o) => {
    const w = 144;
    const r = w / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">
    <g id="ticks" stroke-width="4" stroke="#EFEFEF" x1="${r}" y1="10" x2="${r}" y2="25" >
        <line x1="${r}" y1="5" x2="${r}" y2="20"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(30, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(60, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(90, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(120, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(150, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(180, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(210, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(240, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(270, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(300, ${r}, ${r})"></line>
        <line x1="${r}" y1="5" x2="${r}" y2="20" transform="rotate(330, ${r}, ${r})"></line>
    </g>
    <g stroke="#DDDDDD">
        <circle cx="${r}" cy="${r}" r="4" fill="#DDDDDD" />
        <line id="hours" x1="${r}" y1="32" x2="${r}" y2="67" stroke-width="5" transform="rotate(${o.hourDeg}, ${r}, ${r})"></line>
        <line id="minutes" x1="${r}" y1="16" x2="${r}" y2="67" stroke-width="4" transform="rotate(${o.minDeg}, ${r}, ${r})"></line>
        <line id="seconds" x1="${r}" y1="4" x2="${r}" y2="67" stroke-width="3" transform="rotate(${o.secDeg}, ${r}, ${r})"></line>
    </g>
</svg>`;
};


/*  AM/PM Symbols

<g transform="translate(${r - 7} ${r - 11})">
    <path id="am" fill="${this.invertedColor}" d="M5.92565918,5.90551758 L4.62854004,5.90551758 L4.11291504,4.56408691 L1.75231934,4.56408691 L1.26489258,5.90551758 L0,5.90551758 L2.3001709,0 L3.56103516,0 L5.92565918,5.90551758 Z M3.73022461,3.5690918 L2.91650391,1.37768555 L2.11889648,3.5690918 L3.73022461,3.5690918 Z M6.54199219,5.90551758 L6.54199219,0 L8.32653809,0 L9.39807129,4.02832031 L10.4575195,0 L12.2460938,0 L12.2460938,5.90551758 L11.1383057,5.90551758 L11.1383057,1.25683594 L9.96606445,5.90551758 L8.81799316,5.90551758 L7.64978027,1.25683594 L7.64978027,5.90551758 L6.54199219,5.90551758 Z"></path>
</g>


<g transform="translate(${r - 7} ${r - 11})">
     <path id="pm" fill="${this.invertedColor}" d="M0.75,5.90551758 L0.75,0 L4.79846191,0 L4.79846191,0.999023438 L1.94238281,0.999023438 L1.94238281,2.39685059 L4.40771484,2.39685059 L4.40771484,3.39587402 L1.94238281,3.39587402 L1.94238281,5.90551758 L0.75,5.90551758 Z M6,5.90551758 L6,0 L7.7845459,0 L8.8560791,4.02832031 L9.91552734,0 L11.7041016,0 L11.7041016,5.90551758 L10.5963135,5.90551758 L10.5963135,1.25683594 L9.42407227,5.90551758 L8.27600098,5.90551758 L7.10778809,1.25683594 L7.10778809,5.90551758 L6,5.90551758 Z"></path>
</g>
*/
