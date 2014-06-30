CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = triglut.js oevns.js oevmath.js cothread.js renderlayer.js \
	projector.js trackslayer.js sshlayer.js csv.js compat.js \
	ajaxloaders.js dates.js compositor.js bundle.js doc.js
BUNDLES = bundle.js docbundle.js

# all: docs
all: docbundle.js bundle.js

include $(cjs_dir)/cjs.mak

bundle.js: compositor.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

docs: docbundle.js
	../libs/jsdoc-master/jsdoc $^ ../README.md -u docs_in
	rm -rf ../docs/jsdocs
	mv out jsdocs
	mv jsdocs ../docs/

docbundle.js: doc.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

install: bundle.js
	mkdir -p ../htdocs
	cp bundle.js ../htdocs/
	sed -i -e 's/\.\.\///g' ../htdocs/bundle.js
	cp ../css_gui/loading_composite.svg ../htdocs/
	cp ../css_gui/loading_composite.png ../htdocs/
	cp ../slim_gui/* ../htdocs/
	cp ../alpha/index.html ../htdocs/index.html
	sed -i -e 's/\.\.\/css_gui\///g' \
	  -e 's/\.\.\/src\///g' ../htdocs/index.html

clean::
	rm -f $(BUNDLES)

distclean: clean
	rm -rf ../docs/jsdocs
	rm -rf ../htdocs
