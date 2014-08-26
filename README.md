EddyWebViewer
=============

This is the source code for the eddy webviewer.  The purpose of this
project is to create a fluid and interactive webviewer to replace our
existing MATLAB viewer
(https://github.com/jfaghm/OceanEddies/tree/master/tracks_viewer)

Most of the Ocean Eddies Web Viewer is licensed under the Expat MIT
license.  See the file COPYING for details.

Build the Website from the Sources
----------------------------------

~~~
make -C src install
ln -s /project/expeditions/eddies_project_data/web_viewer htdocs/data
rsync -kurpt --delete-after htdocs/ USER@MACH.cs.umn.edu:/web/research/ucc.umn.edu/eddies/viewer
# Verify the permissions on the files are correct.
~~~
