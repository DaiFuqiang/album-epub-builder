const fs = require('fs-extra')
const sharp = require('sharp')

String.prototype.replaceAll = function(p0, p1) {
	return this.replace(new RegExp(p0, 'gm'), p1).trim()
}

String.prototype.gouge = function(start, stop){
	let p0 = this.indexOf(start)
	if(p0 >= 0) {
		let p1 = this.indexOf(stop, p0)
		if(p1 > p0) {
			return this.substring(0, p0) 
				+ this.substring(p1 + stop.length)
		}
	}
	return this
}

String.prototype.extract = function(start, stop) {
	let p0 = this.indexOf(start)
	if(p0 >= 0) {
		p0 += start.length
		let p1 = this.indexOf(stop, p0)
		if(p1 > p0) {
			return this.substring(p0, p1)
		}
	}
	return null
}

// 构造模板信息
function buildTempate(dir){
	let template = { 
		root : dir,		// 模板数据目录
		text: {			// 模板的文本内容
			mimetype: fs.readFileSync(dir + '/mimetype', 'utf-8'),
			container: fs.readFileSync(dir + '/META-INF/container.xml', 'utf-8'),
			toc: fs.readFileSync(dir + '/content/toc.ncx', 'utf-8'),
			opf: fs.readFileSync(dir + '/content/content.opf', 'utf-8'),
			cover: fs.readFileSync(dir + '/content/htmls/cover.html', 'utf-8'),
			page: fs.readFileSync(dir + '/content/htmls/page.html', 'utf-8'),
			style: fs.readFileSync(dir + '/content/htmls/res/style.css', 'utf-8')
		},
		block: {}
	}

	template.block.point = template.text.toc.extract('<!-- toc.point', '-->')
	template.block.page = template.text.opf.extract('<!-- content.page', '-->')
	template.block.image = template.text.opf.extract('<!-- content.image', '-->')
	template.block.ref = template.text.opf.extract('<!-- content.ref', '-->')
	template.block.item = template.text.page.extract('<!-- page.item', '-->')

	// 剪除模板文本内容中的定义信息
	template.text.page = template.text.page.gouge('<!-- page.item', '-->')
	template.text.toc = template.text.toc.gouge('<!-- toc.point', '-->')
	template.text.opf = template.text.opf.gouge('<!-- content.page', '-->')
		.gouge('<!-- content.image', '-->')
		.gouge('<!-- content.ref', '-->')

	return template
}

// 构造设置信息
function buildSetup(dir) {
	return {
		input: dir,  // 资源目录
		template: buildTempate('./template'),  //模板信息
		book: buildInputInfo(dir), //资源信息
		output: './output', // 临时文件夹
		repo: './books'	// 输出epub文件位置
	}
}

// 准备输出目录
function prepareOutputDir(setup) {
	console.log('## prepare for output directory...')

	// clean up dir
	if(fs.existsSync(setup.output)) {
		console.log('## cleanup existed output dir...')
		fs.emptyDirSync(setup.output)
		fs.rmdirSync(setup.output)
	}

	// prepare dirs
	console.log('## prepare directories...')
	fs.mkdirSync(setup.output)
	fs.mkdirSync(setup.output + '/META-INF')
	fs.mkdirSync(setup.output + '/content')
	fs.mkdirSync(setup.output + '/content/htmls')
	fs.mkdirSync(setup.output + '/content/htmls/res')
	fs.mkdirSync(setup.output + '/content/imgs')
	
	// deploy static files
	console.log('## deploy static files...')
	fs.writeFileSync(setup.output + '/mimetype', setup.template.text.mimetype, 'utf-8')
	fs.writeFileSync(setup.output + '/META-INF/container.xml', setup.template.text.container, 'utf-8')
	fs.writeFileSync(setup.output + '/content/htmls/res/style.css', setup.template.text.style, 'utf-8')
}

// 解析资源的内容
function buildInputInfo(dir) {
	let align = (p, n)=> {return new Array(n - (p + '').length + 1).join('0') + p}
	let strip = (s)=> {let ps = s.split('-'); return ps.length > 1 ? ps[1] : ps[0]}
	
	// 首先从book.json文件中读取信息
	let book = JSON.parse(fs.readFileSync(dir + '/book.json'))
	book.pages = []

	let pageNo = 1
	let imageDir = dir + '/data'
	
	// 根据资源目录下的/data下的目录，生成页面列表
	console.log('## build list of pages...')
	let ds = fs.readdirSync(imageDir)
	ds.forEach((d)=>{
		console.log('## > detect ' + d + '...')
		let state = fs.statSync(imageDir + '/' + d)
		if(state.isDirectory()) {
			let page = {
				no: 	align(pageNo++, 3),
				title: 	strip(d),
				dir: 	d,
				images:	[]
				}
			book.pages.push(page)
		}
	})
	
	// 解析每个页面列表对应的文件列表
	book.pages.forEach((page)=>{
		console.log('## > build ' + page.title + '...')
		let imgNo = 1
		let root = imageDir + '/' + page.dir
		let ms = fs.readdirSync(root)
		ms.forEach((m)=>{
			// TODO 检查扩展名
			let state = fs.statSync(root + '/' + m)
			if(!state.isDirectory()){
				let img = {
					no: 	align(imgNo++, 3),
					file: 	m
				}
				page.images.push(img)
			}
		})
	})
	return book
}

// 构造封面文件
function buildCover(setup){
	console.log('## build cover...')

	let text = setup.template.text.cover.replaceAll('{book.title}', setup.book.title)
	fs.writeFileSync(setup.output + '/content/htmls/cover.html', text, 'utf-8')

	console.log('## deploy cover image file...')
	fs.copyFileSync(
		setup.input + '/cover.jpg',
		setup.output + '/content/htmls/res/cover.jpg')
	console.log('  ## build cover done.')
}


// build toc file
function buidTOC(setup){
	console.log('## build toc file...')
	
	let its = []
	setup.book.pages.forEach((page)=>{
		let t = setup.template.block.point
			.replaceAll('{page.no}', page.no)
			.replaceAll('{page.title}', page.title)
		its.push(t)
	})

	let text = setup.template.text.toc
		.replaceAll('{book.id}', setup.book.id)
		.replaceAll('{book.title}', setup.book.title)
		.replaceAll('{book.author}', setup.book.author)
		.replaceAll('{toc.points}', its.join('\r\n'))
	
	fs.writeFileSync(setup.output + '/content/toc.ncx', text, 'utf-8')

	console.log('  ## build toc file done.')
}

function buildOPF(setup){
	console.log('## build opf file...')
	
	// prepare for items
	let si = []
	let sp = []
	let sr = []
	
	// process page one by one
	setup.book.pages.forEach((page)=>{
		let p = setup.template.block.page
			.replaceAll('{page.no}', page.no)
			.replaceAll('{page.title}', page.title)
	
		sp.push(p)
		
		let r = setup.template.block.ref
			.replaceAll('{page.no}', page.no)
			.replaceAll('{page.title}', page.title)
		
		sr.push(r)
		
		page.images.forEach((img)=>{
			let i = setup.template.block.image
				.replaceAll('{page.no}', page.no)
				.replaceAll('{page.title}', page.title)
				.replaceAll('{img.no}', img.no)
				.trim()
			si.push(i)
			})
	})
	
	let text = setup.template.text.opf
		.replaceAll('{book.id}', setup.book.id)
		.replaceAll('{book.title}', setup.book.title)
		.replaceAll('{book.author}', setup.book.author)
		.replaceAll('{book.date}', setup.book.date)
		.replaceAll('{book.copyright}', setup.book.copyright)
		.replace('{page.zero}', setup.book.pages[0].no)
		.replace('{content.images}', si.join('\r\n'))
		.replace('{content.pages}', sp.join('\r\n'))
		.replace('{content.refs}', sr.join('\r\n'))
	
	// write content to file
	fs.writeFileSync(setup.output + '/content/content.opf', text, 'utf-8')

	console.log('  ## build opf file done.')
}

function buildPages(setup) {
	console.log('## build page files...')

	setup.book.pages.forEach((page)=>{
		console.log('##  > page ' + page.title + '...')
		let ms = []
		page.images.forEach((img)=>{
			let m = setup.template.block.item
				.replaceAll('{page.no}', page.no)
				.replaceAll('{img.no}', img.no)
				.replaceAll('{page.title}', page.title)
			ms.push(m)
		})
		
		let pt = setup.template.text.page
			.replaceAll('{page.title}', page.title)
			.replaceAll('{page.no}', page.no)
			.replaceAll('{page.items}', ms.join('\r\n'))

		let file = setup.output + '/content/htmls/' + page.title + '.html'
		fs.writeFileSync(file, pt, 'utf-8')
	})
	console.log('  ## build page files done.')
}

async function rotateImage(src, dst) {
	await sharp(src).rotate(90).toFile(dst)
}

function deployImages(setup){
	console.log('## deploy images...')

	let sizeof = require('image-size')
	
	setup.book.pages.forEach((page)=>{
		console.log('##  > images for ' + page.title + '...')
		let ds = setup.input + '/data/' + page.dir
		let dr = setup.output + '/content/imgs/' + page.title
		if(!fs.existsSync(dr)) { fs.mkdirSync(dr) }
		page.images.forEach((img)=>{
			let src = ds + '/' + img.file
			let dst = dr + '/' + img.no + '.jpg'
			
			let dem = sizeof(src)
			if(dem.width > dem.height) {
				console.log('##    > roate image ' + img.file + '...')
				rotateImage(src, dst)
			}
			else {
				fs.copyFileSync(src, dst)
			}
		})
	})
	console.log('  ## deploy images done.')
}

function createZipFile(setup, callback, to) {
	console.log('## create epub file...')
	const compressing = require('compressing')
	const zip = new compressing.zip.Stream()
	zip.addEntry(setup.output + '/META-INF')
	zip.addEntry(setup.output + '/content')
	zip.addEntry(setup.output + '/mimetype')
	
	let stream = fs.createWriteStream(setup.repo + '/' + setup.book.name + '.epub')
	zip.pipe(stream)
	stream.on('finish', (e)=>{
		if(callback){
			setTimeout(callback, 200, to)
		 }
	})
}

function buildBook(to){
	if(to.index < to.tasks.length) {
		let setup = buildSetup(to.tasks[to.index++])
		prepareOutputDir(setup)
		buildCover(setup)
		buidTOC(setup)
		buildOPF(setup)
		buildPages(setup)
		deployImages(setup)
		createZipFile(setup, buildBook, to)
	}
	else {
		console.log('##DONE')
	}
}

function buildTasks(dir){
	let to = {
		tasks: [],
		index: 0
	}
	let ds = fs.readdirSync(dir)
	ds.forEach((d)=>{
		let path = dir + '/' + d
		let state = fs.statSync(path)
		if(state.isDirectory()) {
			to.tasks.push(path)
		}
	})
	return to
}


let to = buildTasks('d:/temp/epub')
buildBook(to)
