'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/view/morse/landing.js'), 'utf8');
const start = source.indexOf('option.write = function (sectionId, value) {');
assert(start >= 0);
const end = source.indexOf('\n\t\t};', start);
const writeSource = source.slice(start, end + '\n\t\t}'.length).replace('option.write = ', '');
const channelMap = {
	EU: { a: { bw: '2', s1g_chan: '2' }, b: { bw: '1', s1g_chan: '5' } },
	GB: { a: { bw: '2', s1g_chan: '6' }, b: { bw: '1', s1g_chan: '7' } },
	US: { a: { bw: '1', s1g_chan: '1' }, b: { bw: '8', s1g_chan: '12' } },
};
for (const [country, channel, bandwidth] of [['EU', '5', '1'], ['GB', '7', '1'], ['US', '12', '8']]) {
	const writes = {};
	const uci = { set(config, section, option, value) {
		assert.equal(config, 'wireless');
		assert.equal(section, 'radio1');
		writes[option] = value;
	} };
	const write = new Function('uci', 'channelMap', 'morseDevice', `return ${writeSource};`)(
		uci, channelMap, { '.name': 'radio1' });
	write.call({ super(method, args) {
		assert.equal(method, 'write');
		assert.deepEqual(args, ['radio1', country]);
	} }, 'radio1', country);
	assert.deepEqual(writes, { channel, s1g_chanbw: bandwidth });
}
console.log('Normal country picker selects EU/GB 1 MHz and retains US channel selection: PASS');
