CPP = cpp # C preprocessor
cjs_dir = ../libs/cjs
SOURCES = oevns.js oevnsend.js triglut.js oevmath.js cothread.js \
	renderlayer.js projector.js trackslayer.js sshlayer.js csv.js \
	compat.js ajaxloaders.js dates.js compositor.js
#	chunkloader.js detect.js hpcarray.js

# all: docs
all: bundle.js

include $(cjs_dir)/cjs.mak

bundle.js: compositor.hjs
	CPP=$(CPP) $(cjs_dir)/hjssmash.sh $< -o $@

oevns.djs: oevns.js oevnsend.js
	cat $^ >$@

docs: oevns.djs triglut.djs cothread.djs renderlayer.djs \
	projector.djs trackslayer.djs sshlayer.djs csv.djs \
	compat.djs ajaxloaders.djs dates.djs compositor.djs
	mkdir djs
	for file in $^; do \
	  mv $$file djs/`echo $$file | sed -e 's/\.djs/.js/g'`; \
        done
	../libs/jsdoc-master/jsdoc djs/* ../README.md -u docs_in
	rm -rf djs
	rm -rf ../docs/jsdocs
	mv out jsdocs
	mv jsdocs ../docs/

tracksconv: tracksconv.c qsorts.c xmalloc.c
	cc -O3 $^ -o $@

sshdata: ../data
	CLASSES='jpgssh pngssh' ./sshconv.sh

install: bundle.js
	mkdir -p ../htdocs
	cp bundle.js ../htdocs/
	sed -i -e 's/\.\.\///g' ../htdocs/bundle.js
	cp ../slim_gui/* ../htdocs/
	cp ../alpha/index.html ../htdocs/index.html
	sed -i -e 's/\.\.\/src\///g' ../htdocs/index.html
	-chmod go+r ../htdocs/*

clean::
	rm -f bundle.js tracksconv

distclean: clean
	rm -rf ../docs/jsdocs
	rm -rf ../htdocs
