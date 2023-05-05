declare -i counter=0
while true
do
    counter=$(($counter + 1))
    echo "\n[flakester] run number $counter ... \n"
    rush cover
    if [ $? -eq 0 ]
    then
        echo "[flakester] All tests passed."
    else
        echo "[flakester] A test failed. Stopping."
        exit 1
    fi
done
