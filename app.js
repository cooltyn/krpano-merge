const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const mergeImages = require('merge-img');
const request = require('request');
const readlineSync = require('readline-sync');
const DOMParser = require('xmldom').DOMParser;

let urls_full;
let data = {};
let user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36';

let default_xmls = [
	'https://krpano.com/tours/kuchlerhaus/tour.xml',
	'https://krpano.com/tours/weingut/tour.xml',
	'https://krpano.com/tours/corfu/tour.xml',
	'https://krpano.com/tours/bkeller/bkellertour.xml',
	'https://krpano.com/tours/paris/tour.xml',
	'https://krpano.com/panos/rom/petersplatz/blickvonkuppel/petersplatzkuppel.xml',
	'https://krpano.com/panos/ecliptique/ok.xml',
	'https://krpano.com/panos/rom/trevibrunnen/pano.xml',
	'https://krpano.com/panos/owens/owens.xml',
	'https://krpano.com/panos/rom/kolosseum/seite/kolosseum_seite.xml',
	'https://krpano.com/panos/balkon/balkon.xml',
	'https://krpano.com/panos/rom/kolosseum/vorne/kolosseum_vorne.xml',
	'https://krpano.com/panos/korfu/altefestung/panoonly.xml',
	'https://krpano.com/panos/hafen/hafen.xml',
	'https://krpano.com/panos/andreabiffi/galleria_04.xml',
	'https://krpano.com/panos/sanctuarie/sanctuarie.xml',
	'https://krpano.com/panos/divingboard/divingboard.xml',
	'https://krpano.com/panos/tokyo45gp/tokyo.xml'
];
let xml_url;

function start_select() {
	let xml_num = readlineSync.keyInSelect(default_xmls, 'Select url');
	if(xml_num==-1) {console.log();
		xml_url = readlineSync.question('Enter valid krpano xml url: ', {defaultInput: xml_url});
	} else {
		xml_url = default_xmls[xml_num];
	}
	
	request({url: xml_url, headers: {'User-Agent': user_agent}}, function (err, response, body) {
		try {
			if(err || response.statusCode!=200) {
				throw new Error('No valid data at this url');
			} else {
				let doc = new DOMParser().parseFromString(body);
				let scene = select_scene(doc);
				let image = select_image(scene);
				let level = select_level(image);
				parse_image_xml(level, doc);
			}
		} catch (err) {
			console.log();
			console.log(err.name + ': ' + err.message);
			// console.log(err);
			start_select();
		}
	})
}
function select_scene(doc) {
	let scene_tag = doc.getElementsByTagName('scene');
	if(scene_tag.length) {
		let scenes = [];
		for(let i=0; i<scene_tag.length; i++) {
			scenes.push(scene_tag[i].getAttribute('name'));
		}
		let scene_index = readlineSync.keyInSelect(scenes, 'Select scene');
		if(scene_index == -1) {
			throw new Error('No scene selected');
		} else {
			return scene_tag[scene_index];
		}
	} else {
		return doc;
	}
}
function select_image(doc) {
	let image_tag = doc.getElementsByTagName('image');
	if(image_tag.length==1) {
		return image_tag[0];
	} else
	if(image_tag.length == 0) {
		throw new Error('No <image> tag');
	} else
	if(image_tag.length) {
		for(let i=0; i<image_tag.length; i++) {
			if(image_tag[i].childNodes.length) {
				return image_tag[i];
			}
		}
	}
}
function select_level(doc) {
	baseindex = doc.getAttribute('baseindex');
	if(baseindex!='') {
		data.baseindex = baseindex;
	} else {
		data.baseindex = 1;
	}
	let level_tag = doc.getElementsByTagName('level');
	if(level_tag.length && doc.getAttribute('multires')) {
		data.tilesize = doc.getAttribute('tilesize');
		let levels = [];
		for(let i=0; i<level_tag.length; i++) {
			let tiledimagewidth = level_tag[i].getAttribute('tiledimagewidth');
			let tiledimageheight = level_tag[i].getAttribute('tiledimageheight');
			levels.push(tiledimagewidth+'x'+tiledimageheight+' ('+6*Math.ceil(tiledimagewidth/data.tilesize)*Math.ceil(tiledimageheight/data.tilesize)+' tiles)');
		}
		let level_index = readlineSync.keyInSelect(levels, 'Select zoom level');
		if(level_index == -1) {
			throw new Error('No zoom level selected');
		} else {
			return level_tag[level_index];
		}
	} else {
		data.tilesize = null;
		return doc;
	}
}
function parse_image_xml(image, doc) {
	data.tileserver = getElementsWithAttribute(doc, 'tileserver');
	if(data.tileserver.length) {
		data.tileserver = data.tileserver[0];
	} else {
		data.tileserver = path.dirname(xml_url);
	}
	let direction_titles = ['front','right','back','left','up','down'];
	urls_full = [];
	if(image.getElementsByTagName('cube').length) {
		let url = image.getElementsByTagName('cube')[0].getAttribute('url');
		urls_full = direction_titles.map(item => {
			return {
				images: [{
					src: url.replace(/%s/g, item[0])
				}],
				direction: item
			}
		});
	} else
	if(image.getElementsByTagName('sphere').length) {
		urls_full = [{
			images: [{
				src: image.getElementsByTagName('sphere')[0].getAttribute('url')
			}],
			direction: 'image'
		}];
	} else
	if(image.getElementsByTagName('cylinder').length) {
		urls_full = [{
			images: [{
				src: image.getElementsByTagName('cylinder')[0].getAttribute('url')
			}],
			direction: 'image'
		}];
	} else
	if(image.getElementsByTagName('front').length) {
		urls_full = direction_titles.map(item => {
			return {
				images: [{
					src: image.getElementsByTagName(item)[0].getAttribute('url')
				}],
				direction: item
			}
		});
	}
	urls_full.forEach(item => {
		item.images[0].src = url_check(item.images[0].src);
	})
	if(data.tilesize) {
		data.tiledimagewidth = image.getAttribute('tiledimagewidth');
		data.tiledimageheight = image.getAttribute('tiledimageheight');
		urls_full.forEach(item => {
			let url = item.images[0].src;
			item.images = [];
			for(let y=data.baseindex; y<(data.baseindex+Math.ceil(data.tiledimageheight/data.tilesize)); y++) {
				for(let x=data.baseindex; x<(data.baseindex+Math.ceil(data.tiledimagewidth/data.tilesize)); x++) {
					item.images.push({
						src: url.replace(/%(0)*[uh]/g, function(str, a){
							return a===undefined?x:pad(x, a.length+1);
						}).replace(/%(0)*v/g, function(str, a){
							return a===undefined?y:pad(y, a.length+1);
						}),
						offsetX: ((x==data.baseindex&&y!=data.baseindex)?-data.tiledimagewidth:0),
						offsetY: (y-data.baseindex)*data.tilesize
					})
				}
			}
		})
	}
	console.log();
	// console.log(JSON.stringify(urls_full, null, 2));
	let archive_name = 'krpano_merged_'+Date.now()+'.zip';
	let output = fs.createWriteStream('./'+archive_name);
	output.on('close', function() {
		console.log();
		console.log('Archive saved ('+archive_name+', '+(archive.pointer()/(1024*1024)).toFixed(2)+'mb)');
		console.log();
		if(readlineSync.keyInYNStrict('Download another image?')) {
			start_select();
		}
	});
	let archive = archiver('zip', {
		zlib: { level: 0 }
	});
	archive.pipe(output);
	merge_image(0, archive);
}
function merge_image(i, archive) {
	function add_to_result(result) {
		console.log('done');
		archive.append(result, { name: item.direction+'.jpg' });
		if(i == urls_full.length - 1) {
			archive.finalize();
		} else {
			merge_image(i+1, archive);
		}
	}
	let item = urls_full[i];
	console.log('download '+(i+1) + '/' + urls_full.length+'...');
	if(item.images.length==1) {
		request({url: item.images[0].src, encoding: null, headers: {'User-Agent': user_agent}}, function (err, response, body) {
			if(err) return start_select();
			if(response.statusCode==200) {
				add_to_result(Buffer.from(body));
			} else {
				return start_select();
			}
		})
	} else {
		mergeImages(item.images)
			.then(img => {
				img.getBuffer('image/jpeg', (error, result) => {
					add_to_result(result);
				});
			})
	}
}

function path_append(path) {
	if(path[path.length-1] != '/') {
		path += '/';
	}
	for (let i = 1; i < arguments.length; i++) {
		path += arguments[i] + '/';
	}
	return path;
}
function getElementsWithAttribute(doc, attribute) {
	let result = [];
	let allElements = doc.getElementsByTagName('*');
	for (let i=0, n=allElements.length; i<n; i++){
		if (allElements[i].getAttribute(attribute)) {
	  		result.push(allElements[i].getAttribute(attribute));
		}
	}
	return result;
}
function url_check(url) {
	if(!/%\$tileserver%/.test(url)) {
		url = '%$tileserver%/'+url;
	}
	url = url.replace('%$tileserver%', data.tileserver);
	return url;
}
function pad(str, max) {
	str = str.toString();
	return str.length < max ? pad('0' + str, max) : str;
}

start_select();