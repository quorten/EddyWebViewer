EddyWebViewer
=============

This is the source code for the eddy webviewer.
The purpose of this project is to create a fluid and interactive webviewer to replace our existing MATLAB viewer (https://github.com/jfaghm/OceanEddies/tree/master/tracks_viewer)

Build the Website from the Sources
----------------------------------

~~~
make -C src install
chmod go+r htdocs/*
ln -s /project/expeditions/eddies_project_data/web_viewer htdocs/data
ln -s ... htdocs/blue_marble
rsync -rupt htdocs/ USER@MACH.cs.umn.edu:/web/research/ucc.umn.edu/eddies/viewer
# Verify the permissions on all the files.
~~~
