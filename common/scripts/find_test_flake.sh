declare -i counter=0
while true
do
    counter=$(($counter + 1))
    rush cover

    echo "\n[flakester] ran $counter times\n"

    if [ $? -eq 0 ]
    then
        echo "[flakester] All tests passed."
    else
        echo "[flakester] A test failed. Stopping."
        exit 1
    fi
done
