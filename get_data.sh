#! /bin/sh

DATA_PREFIX=http://climatechange.cs.umn.edu/eddies/viewer/data

# 1. Download the NASA Blue Marble images.
mkdir -p blue_marble
cd blue_marble

cat <<EOF >source.txt
NASA Visible Earth: Blue Marble Next Generation Collection

http://visibleearth.nasa.gov/view_cat.php?categoryID=1484

More information about the Blue Marble Next Generation Collection:

http://earthobservatory.nasa.gov/Features/BlueMarble/?src=ve
EOF
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74268/readme.pdf
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/55000/55167/earth_lights.gif
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/55000/55167/earth_lights_lrg.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74243/world.topo.200401.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73938/world.200401.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74268/world.topo.200402.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73967/world.200402.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74293/world.topo.200403.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73992/world.200403.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74318/world.topo.200404.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74017/world.200404.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74343/world.topo.200405.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74042/world.200405.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/76000/76487/world.200406.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74393/world.topo.200407.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74418/world.topo.200408.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74117/world.200408.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74443/world.topo.200409.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74142/world.200409.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74468/world.topo.200410.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74167/world.200410.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74493/world.topo.200411.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74192/world.200411.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74518/world.topo.200412.3x5400x2700.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74218/world.200412.3x5400x2700.jpg

cd ..

# 2. Download the pre-generated list of dates from the U of M server.
mkdir -p data
cd data

wget -c ${DATA_PREFIX}/dates.dat
DATES=`cat dates.dat`

# 3. Download the pre-generated eddy track data from the U of M
#    server.
wget -c ${DATA_PREFIX}/tracks.wtxt

# 4. Download the pre-generated Sea Surface Height (SSH) image data
#    from the U of M server.
wget -c ${DATA_PREFIX}/ssh.ogv
mkdir -p jpgssh
mkdir -p pngssh
for DATE in $DATES; do
    cd jpgssh
    wget -c ${DATA_PREFIX}/jpgssh/ssh_$DATE.jpg
    cd ../pngssh
    wget -c ${DATA_PREFIX}/pngssh/ssh_$DATE.png
    cd ..
done

exit

# 5. OPTIONAL.  Download the original unprocessed data.

mkdir tracks
cd tracks
wget -c ${DATA_PREFIX}/tracks/acyc_bu_tracks.json
wget -c ${DATA_PREFIX}/tracks/cyc_bu_tracks.json
cd ..

mkdir -p SSH
cd SSH
for DATE in $DATES; do
    wget -c ${DATA_PREFIX}/SSH/ssh_$DATE.dat
done
cd ..
