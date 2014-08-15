CPP = cpp # C preprocessor
cjs_dir = ../libs/cjs
DOCSRC = triglut.js oevmath.js cothread.js ajaxloaders.js projector.js \
	renderlayer.js trackslayer.js sshlayer.js earthtexlayer.js \
	csv.js compat.js dates.js compositor.js viewparams.js
#	chunkloader.js detect.js hpcarray.js
SOURCES = oevns.js oevnsend.js  $(DOCSRC)

all: bundle.js

include $(cjs_dir)/cjs.mak

bundle.js: compositor.hjs
	CPP=$(CPP) $(cjs_dir)/hjssmash.sh $< -o $@

oevns.djs: oevns.js oevnsend.js
	cat $^ >$@

docs: oevns.djs $(DOCSRC:.js=.djs)
	rm -rf djs
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
	CLASSES='jpgssh pngssh' sh -- ./sshconv.sh -v

optracks: tracksconv
	./tracksconv -v -o ../data/tracks.wtxt \
	0 ../data/tracks/acyc_bu_tracks.json \
	1 ../data/tracks/cyc_bu_tracks.json

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
